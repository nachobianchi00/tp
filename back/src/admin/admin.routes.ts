import { Router } from 'express'
import type { ErrorRequestHandler } from 'express'
import { findAll, findOne, add, update } from './admin.controler.js'
import { requireAuthentication, requireAccountType, requireAccountOwner } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'
import { ServiceError, isRecord } from '../shared/service-errors.js'

/** Recibe los mismos orígenes que auth; permite probar el router sin importar index.ts. */
export function createAdminRouter(options: { allowedOrigins: readonly string[] }): Router {
  const adminRouter = Router()
  const protectCsrf = createCsrfProtection(options)

  adminRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  adminRouter.use(requireAuthentication, requireAccountType('admin'))

  adminRouter.get('/', findAll)
  adminRouter.get('/:id', findOne)
  adminRouter.post('/', protectCsrf, add)
  adminRouter.put('/:id', requireAccountOwner('admin'), protectCsrf, update)
  adminRouter.delete('/:id', protectCsrf, (_req, res) => {
    // No se invoca remove ni deleteAdmin hasta acordar eliminación y revocación de sesiones.
    res.status(403).json({ message: 'La eliminación de administradores está temporalmente bloqueada' })
  })
  adminRouter.use(adminAccessErrorHandler)
  return adminRouter
}

/** Solo para errores de acceso, sesiones y parser en /api/admins. Los controladores conservan sus errores. */
export const adminAccessErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
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
  res.status(500).json({ message: 'No se pudo comprobar el acceso administrativo' })
}
