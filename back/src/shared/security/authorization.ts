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

type PermissionCheck = (request: Request, identity: AuthIdentity) => void

/** Comparte la lectura de sesión y el manejo de errores entre las comprobaciones. */
function createAuthorizationMiddleware(checkPermissions: PermissionCheck): RequestHandler {
  return async (request, response, next) => {
    try {
      // No se confía en una identidad previa de locals, del body ni de la query.
      delete response.locals.identity
      const identity = await getSessionIdentity(request)
      if (!identity) throw new ServiceError('No autenticado', 401)

      checkPermissions(request, identity)
      // getSessionIdentity devuelve una copia con únicamente id y tipo.
      response.locals.identity = identity
    } catch (error) {
      next(error)
      return
    }
    next()
  }
}

function validateAccountType(tipo: AccountType): void {
  if (tipo !== 'cliente' && tipo !== 'admin') {
    throw new Error('Authorization requires a valid account type')
  }
}

/** Exige una sesión autenticada y respeta su vencimiento absoluto de 30 minutos. */
export const requireAuthentication: RequestHandler = createAuthorizationMiddleware(() => {})

/** Puede usarse sola: comprueba también la autenticación antes de revisar el tipo. */
export function requireAccountType(...tipos: AccountType[]): RequestHandler {
  if (tipos.length === 0) throw new Error('Authorization requires at least one account type')
  tipos.forEach(validateAccountType)
  const allowedTypes = new Set(tipos)
  return createAuthorizationMiddleware((_request, identity) => {
    if (!allowedTypes.has(identity.tipo)) throw new ServiceError('Acceso no autorizado', 403)
  })
}

/**
 * Compara el ID de una cuenta del tipo indicado con la sesión; no concede excepciones a Admin.
 * No sirve para IDs de Pedido, DetallePedido o Pago: esos recursos requieren comprobar sus relaciones.
 */
export function requireAccountOwner(tipo: AccountType, parameterName = 'id'): RequestHandler {
  validateAccountType(tipo)
  if (typeof parameterName !== 'string' || !parameterName || parameterName !== parameterName.trim()) {
    throw new Error('Authorization requires a route parameter name')
  }

  return createAuthorizationMiddleware((request, identity) => {
    if (identity.tipo !== tipo) throw new ServiceError('Acceso no autorizado', 403)
    const value = Object.hasOwn(request.params, parameterName) ? request.params[parameterName] : undefined
    // Evita interpretar "7otro" como 7; admite únicamente un entero positivo completo.
    if (typeof value !== 'string' || !/^\d+$/.test(value)
      || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
      throw new ServiceError('ID de cuenta inválido', 400)
    }
    if (Number(value) !== identity.id) throw new ServiceError('Acceso no autorizado', 403)
  })
}
