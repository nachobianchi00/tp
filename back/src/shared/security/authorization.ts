import type { Request, RequestHandler } from 'express'
import type { AccountType, AuthIdentity } from '../../auth/auth.service.js'
import { getSessionIdentity } from '../../auth/session.service.js'
import { ServiceError } from '../service-errors.js'

export interface AuthorizationLocals {
  /** Solo existe después de una comprobación satisfactoria en esta solicitud. */
  identity?: AuthIdentity
}

declare global {
  namespace Express {
    interface Locals extends AuthorizationLocals {}
  }
}

type ComprobacionDePermisos = (solicitud: Request, identidad: AuthIdentity) => void

/** Comparte la lectura de sesión y el manejo de errores entre las comprobaciones. */
function crearMiddlewareDeAutorizacion(comprobarPermisos: ComprobacionDePermisos): RequestHandler {
  return async (solicitud, respuesta, next) => {
    try {
      // No se confía en una identidad previa de locals, del body ni de la query.
      delete respuesta.locals.identity
      const identidad = await getSessionIdentity(solicitud)
      if (!identidad) throw new ServiceError('No autenticado', 401)

      comprobarPermisos(solicitud, identidad)
      // getSessionIdentity devuelve una copia con únicamente id y tipo.
      respuesta.locals.identity = identidad
    } catch (error) {
      next(error)
      return
    }
    next()
  }
}

function validarTipoDeCuenta(tipo: AccountType): void {
  if (tipo !== 'cliente' && tipo !== 'admin') {
    throw new Error('Authorization requires a valid account type')
  }
}

/** Exige una sesión autenticada y respeta su vencimiento absoluto de 30 minutos. */
export const requireAuthentication: RequestHandler = crearMiddlewareDeAutorizacion(() => {})

/** Puede usarse sola: comprueba también la autenticación antes de revisar el tipo. */
export function requireAccountType(...tipos: AccountType[]): RequestHandler {
  if (tipos.length === 0) throw new Error('Authorization requires at least one account type')
  tipos.forEach(validarTipoDeCuenta)
  const tiposPermitidos = new Set(tipos)
  return crearMiddlewareDeAutorizacion((_request, identidad) => {
    if (!tiposPermitidos.has(identidad.tipo)) throw new ServiceError('Acceso no autorizado', 403)
  })
}

function comprobarTitularidad(solicitud: Request, identidad: AuthIdentity, tipo: AccountType, nombreParametro: string): void {
  if (identidad.tipo !== tipo) throw new ServiceError('Acceso no autorizado', 403)
  const valor = Object.hasOwn(solicitud.params, nombreParametro) ? solicitud.params[nombreParametro] : undefined
  // Evita interpretar "7otro" como 7; admite únicamente un entero positivo completo.
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)
    || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0) {
    throw new ServiceError('ID de cuenta inválido', 400)
  }
  if (Number(valor) !== identidad.id) throw new ServiceError('Acceso no autorizado', 403)
}

/** Comprueba la sesión una vez: Admin consulta cualquier Cliente; Cliente solo su cuenta. */
export const exigirTitularClienteOAdmin: RequestHandler = crearMiddlewareDeAutorizacion((solicitud, identidad) => {
  if (identidad.tipo !== 'admin') comprobarTitularidad(solicitud, identidad, 'cliente', 'id')
})

/**
 * Compara el ID de una cuenta del tipo indicado con la sesión; no concede excepciones a Admin.
 * No sirve para IDs de Pedido, DetallePedido o Pago: esos recursos requieren comprobar sus relaciones.
 */
export function requireAccountOwner(tipo: AccountType, nombreParametro = 'id'): RequestHandler {
  validarTipoDeCuenta(tipo)
  if (typeof nombreParametro !== 'string' || !nombreParametro || nombreParametro !== nombreParametro.trim()) {
    throw new Error('Authorization requires a route parameter name')
  }

  return crearMiddlewareDeAutorizacion((solicitud, identidad) => {
    comprobarTitularidad(solicitud, identidad, tipo, nombreParametro)
  })
}
