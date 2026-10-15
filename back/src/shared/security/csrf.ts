import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { ServiceError } from '../service-errors.js'
import { SESSION_TTL_MS } from './session.js'
import type {} from './session.types.js'

export const CSRF_HEADER_NAME = 'x-csrf-token'
export const CSRF_TOKEN_TTL_MS = SESSION_TTL_MS
const FORMATO_TOKEN = /^[a-f0-9]{64}$/
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])
type SolicitudConSesion = Pick<Request, 'session' | 'sessionID'>
type SolicitudConCabeceras = Pick<Request, 'headers'>
type TokenDeSesion = NonNullable<Request['session']['csrf']>

function errorCsrf(): ServiceError {
  return new ServiceError('Solicitud CSRF inválida', 403)
}

// La fecha se guarda solo en el servidor; el token no contiene ID, identidad ni vencimiento.
function calcularVencimiento(sesion: Request['session'], ahora: number): number {
  if (sesion.identity === undefined && sesion.authenticatedAt === undefined) {
    return ahora + CSRF_TOKEN_TTL_MS
  }
  const inicio = sesion.authenticatedAt
  if (!sesion.identity || typeof inicio !== 'number' || !Number.isSafeInteger(inicio)
    || inicio <= 0 || inicio > ahora || ahora - inicio >= SESSION_TTL_MS) {
    throw errorCsrf()
  }
  return inicio + SESSION_TTL_MS
}

function esTokenVigente(
  tokenGuardado: TokenDeSesion | undefined,
  idSesion: string,
  vencimiento: number,
  ahora: number,
): tokenGuardado is TokenDeSesion {
  return tokenGuardado !== undefined && tokenGuardado !== null && typeof tokenGuardado === 'object'
    && tokenGuardado.sessionId === idSesion && typeof tokenGuardado.token === 'string' && FORMATO_TOKEN.test(tokenGuardado.token)
    && Number.isSafeInteger(tokenGuardado.expiresAt) && tokenGuardado.expiresAt > ahora && tokenGuardado.expiresAt <= vencimiento
}

/** Obtiene o genera el token asociado a esta sesión, incluso si es anónima. */
export async function getCsrfToken(solicitud: SolicitudConSesion): Promise<string> {
  const sesion = solicitud.session
  const idSesion = solicitud.sessionID
  if (!sesion || typeof idSesion !== 'string' || !idSesion || sesion.id !== idSesion) {
    throw new ServiceError('No se pudo preparar la protección CSRF', 500)
  }
  const ahora = Date.now()
  const vencimiento = calcularVencimiento(sesion, ahora)
  if (esTokenVigente(sesion.csrf, idSesion, vencimiento, ahora)) return sesion.csrf.token

  try {
    sesion.csrf = {
      token: randomBytes(32).toString('hex'),
      sessionId: idSesion,
      expiresAt: Math.min(ahora + CSRF_TOKEN_TTL_MS, vencimiento),
    }
    // saveUninitialized:false requiere modificar y guardar la sesión anónima antes de devolver el token.
    await new Promise<void>((resolve, reject) => {
      sesion.save(error => error ? reject(error) : resolve())
    })
    return sesion.csrf.token
  } catch {
    delete sesion.csrf
    throw new ServiceError('No se pudo preparar la protección CSRF', 500)
  }
}

/** Validación sin generación; el middleware toma el token exclusivamente de X-CSRF-Token. */
export function validateCsrfToken(solicitud: SolicitudConSesion, token: unknown): void {
  const sesion = solicitud.session
  const idSesion = solicitud.sessionID
  if (!sesion || typeof idSesion !== 'string' || !idSesion || sesion.id !== idSesion
    || typeof token !== 'string' || !FORMATO_TOKEN.test(token)) throw errorCsrf()
  const ahora = Date.now()
  const vencimiento = calcularVencimiento(sesion, ahora)
  if (!esTokenVigente(sesion.csrf, idSesion, vencimiento, ahora)) throw errorCsrf()
  // Ambas entradas se validaron con la misma longitud y codificación antes de usar la función nativa.
  if (!timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(sesion.csrf.token, 'hex'))) throw errorCsrf()
}

function leerOrigen(valor: unknown, soloOrigen: boolean): URL | null {
  if (typeof valor !== 'string' || !/^https?:\/\/[^/?#]/i.test(valor)
    || valor !== valor.trim() || /[\s\u0000-\u001f\u007f\\]/.test(valor)) return null
  try {
    const url = new URL(valor)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
    if (soloOrigen && valor !== url.origin) return null
    return url
  } catch {
    return null
  }
}

function prepararOrigenes(origenes: readonly string[]): Set<string> {
  if (!Array.isArray(origenes) || origenes.length === 0) {
    throw new Error('CSRF requires an explicit list of allowed origins')
  }
  const permitidos = new Set<string>()
  for (const origen of origenes) {
    const url = leerOrigen(origen, true)
    if (!url) throw new Error('CSRF allowed origins must be complete HTTP(S) origins without paths')
    permitidos.add(url.origin)
  }
  return permitidos
}

function comprobarOrigen(solicitud: SolicitudConCabeceras, permitidos: ReadonlySet<string>): void {
  const origen = solicitud.headers.origin
  // Un Origin presente pero inválido no puede salvarse con un Referer permitido.
  const urlRecibida = origen === undefined
    ? leerOrigen(solicitud.headers.referer, false)
    : leerOrigen(origen, true)
  if (!urlRecibida || !permitidos.has(urlRecibida.origin)) throw errorCsrf()
}

/** Compara protocolo, host y puerto completos. No confía en Host ni en X-Forwarded-Host. */
export function validateRequestOrigin(solicitud: SolicitudConCabeceras, allowedOrigins: readonly string[]): void {
  comprobarOrigen(solicitud, prepararOrigenes(allowedOrigins))
}

/** Protege las escrituras; GET, HEAD y OPTIONS no deben modificar datos. */
export function createCsrfProtection(opciones: { allowedOrigins: readonly string[] }): RequestHandler {
  const permitidos = prepararOrigenes(opciones.allowedOrigins)
  return (solicitud, _response, next) => {
    if (METODOS_SEGUROS.has(solicitud.method)) return next()
    try {
      comprobarOrigen(solicitud, permitidos)
      validateCsrfToken(solicitud, solicitud.headers[CSRF_HEADER_NAME])
      next()
    } catch (error) {
      next(error)
    }
  }
}
