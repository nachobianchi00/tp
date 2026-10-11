import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { ServiceError } from '../service-errors.js'
import { SESSION_TTL_MS } from './session.js'
import type {} from './session.types.js'

export const CSRF_HEADER_NAME = 'x-csrf-token'
export const CSRF_TOKEN_TTL_MS = SESSION_TTL_MS
const TOKEN_FORMAT = /^[a-f0-9]{64}$/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
type SessionRequest = Pick<Request, 'session' | 'sessionID'>
type OriginRequest = Pick<Request, 'headers'>
type StoredToken = NonNullable<Request['session']['csrf']>

function forbidden(): ServiceError {
  return new ServiceError('Solicitud CSRF inválida', 403)
}

// La fecha se guarda solo en el servidor; el token no contiene ID, identidad ni vencimiento.
function sessionDeadline(current: Request['session'], now: number): number {
  if (current.identity === undefined && current.authenticatedAt === undefined) {
    return now + CSRF_TOKEN_TTL_MS
  }
  const start = current.authenticatedAt
  if (!current.identity || typeof start !== 'number' || !Number.isSafeInteger(start)
    || start <= 0 || start > now || now - start >= SESSION_TTL_MS) {
    throw forbidden()
  }
  return start + SESSION_TTL_MS
}

function usableToken(state: StoredToken | undefined, sessionId: string, deadline: number, now: number): state is StoredToken {
  return state !== undefined && state !== null && typeof state === 'object'
    && state.sessionId === sessionId && typeof state.token === 'string' && TOKEN_FORMAT.test(state.token)
    && Number.isSafeInteger(state.expiresAt) && state.expiresAt > now && state.expiresAt <= deadline
}

/** Token sincronizado de OWASP, incluso anónimo. El futuro endpoint lo entregará como JSON con Cache-Control:no-store. */
export async function getCsrfToken(request: SessionRequest): Promise<string> {
  const current = request.session
  const sessionId = request.sessionID
  if (!current || typeof sessionId !== 'string' || !sessionId || current.id !== sessionId) {
    throw new ServiceError('No se pudo preparar la protección CSRF', 500)
  }
  const now = Date.now()
  const deadline = sessionDeadline(current, now)
  if (usableToken(current.csrf, sessionId, deadline, now)) return current.csrf.token

  try {
    current.csrf = {
      token: randomBytes(32).toString('hex'),
      sessionId,
      expiresAt: Math.min(now + CSRF_TOKEN_TTL_MS, deadline),
    }
    // saveUninitialized:false requiere modificar y guardar la sesión anónima antes de devolver el token.
    await new Promise<void>((resolve, reject) => {
      current.save(error => error ? reject(error) : resolve())
    })
    return current.csrf.token
  } catch {
    delete current.csrf
    throw new ServiceError('No se pudo preparar la protección CSRF', 500)
  }
}

/** Validación sin generación; el middleware toma el token exclusivamente de X-CSRF-Token. */
export function validateCsrfToken(request: SessionRequest, token: unknown): void {
  const current = request.session
  const sessionId = request.sessionID
  if (!current || typeof sessionId !== 'string' || !sessionId || current.id !== sessionId
    || typeof token !== 'string' || !TOKEN_FORMAT.test(token)) throw forbidden()
  const now = Date.now()
  const deadline = sessionDeadline(current, now)
  if (!usableToken(current.csrf, sessionId, deadline, now)) throw forbidden()
  // Ambas entradas se validaron con la misma longitud y codificación antes de usar la función nativa.
  if (!timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(current.csrf.token, 'hex'))) throw forbidden()
}

function parseSource(value: unknown, originOnly: boolean): URL | null {
  if (typeof value !== 'string' || !/^https?:\/\/[^/?#]/i.test(value)
    || value !== value.trim() || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
    if (originOnly && value !== url.origin) return null
    return url
  } catch {
    return null
  }
}

function configuredOrigins(origins: readonly string[]): Set<string> {
  if (!Array.isArray(origins) || origins.length === 0) {
    throw new Error('CSRF requires an explicit list of allowed origins')
  }
  const allowed = new Set<string>()
  for (const origin of origins) {
    const url = parseSource(origin, true)
    if (!url) throw new Error('CSRF allowed origins must be complete HTTP(S) origins without paths')
    allowed.add(url.origin)
  }
  return allowed
}

function checkOrigin(request: OriginRequest, allowed: ReadonlySet<string>): void {
  const origin = request.headers.origin
  // Un Origin presente pero inválido no puede salvarse con un Referer permitido.
  const source = origin === undefined
    ? parseSource(request.headers.referer, false)
    : parseSource(origin, true)
  if (!source || !allowed.has(source.origin)) throw forbidden()
}

/** Compara protocolo, host y puerto completos. No confía en Host ni en X-Forwarded-Host. */
export function validateRequestOrigin(request: OriginRequest, allowedOrigins: readonly string[]): void {
  checkOrigin(request, configuredOrigins(allowedOrigins))
}

/** Sin registrar: GET/HEAD/OPTIONS no deben modificar datos del dominio. CSRF no reemplaza la autorización. */
export function createCsrfProtection(options: { allowedOrigins: readonly string[] }): RequestHandler {
  const allowed = configuredOrigins(options.allowedOrigins)
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) return next()
    try {
      checkOrigin(request, allowed)
      validateCsrfToken(request, request.headers[CSRF_HEADER_NAME])
      next()
    } catch (error) {
      next(error)
    }
  }
}
