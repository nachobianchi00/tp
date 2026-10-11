import { Router, type ErrorRequestHandler, type RequestHandler } from 'express'
import { findAll, findOne, add, update, remove } from './metodoPago.controler.js'
import { requireAccountType } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'
import { ServiceError, isRecord } from '../shared/service-errors.js'

export function createMetodoPagoRouter(options: { allowedOrigins: readonly string[] }): Router {
  const metodoPagoRouter = Router()
  const requireAdmin = requireAccountType('admin')
  const protectCsrf = createCsrfProtection(options)
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  }

  // Los métodos mantienen sus consultas públicas; solo las escrituras comprueban permisos y CSRF.
  metodoPagoRouter.get('/', findAll)
  metodoPagoRouter.get('/:id', findOne)
  metodoPagoRouter.post('/', noStore, requireAdmin, protectCsrf, add)
  metodoPagoRouter.put('/:id', noStore, requireAdmin, protectCsrf, update)
  metodoPagoRouter.delete('/:id', noStore, requireAdmin, protectCsrf, remove)
  metodoPagoRouter.use(metodoPagoAccessErrorHandler)
  return metodoPagoRouter
}

/** Errores de acceso, sesiones y parser; los controladores conservan sus respuestas de negocio. */
export const metodoPagoAccessErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error)
  res.set('Cache-Control', 'no-store')
  if (error instanceof ServiceError && [400, 401, 403].includes(error.statusCode)) {
    res.status(error.statusCode).json({ message: error.message })
    return
  }
  const parseErrors: Record<string, { status: number; message: string }> = {
    'entity.parse.failed': { status: 400, message: 'JSON inválido' },
    'entity.too.large': { status: 413, message: 'Solicitud demasiado grande' },
    'charset.unsupported': { status: 415, message: 'Codificación no admitida' },
    'encoding.unsupported': { status: 415, message: 'Codificación no admitida' },
  }
  const parserError = isRecord(error) && typeof error.type === 'string'
    && Object.hasOwn(parseErrors, error.type) ? parseErrors[error.type] : undefined
  if (parserError) {
    res.status(parserError.status).json({ message: parserError.message })
    return
  }
  res.status(500).json({ message: 'No se pudo comprobar el acceso a métodos de pago' })
}
