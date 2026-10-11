import { Router } from 'express'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { findAll, findOne, add, update } from './cliente.controler.js'
import { requireAuthentication, requireAccountType, requireAccountOwner } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'
import { ServiceError, isRecord } from '../shared/service-errors.js'

/** Comparte la sesión y los orígenes configurados para auth, sin importar index.ts. */
export function createClienteRouter(options: { allowedOrigins: readonly string[] }): Router {
  const clienteRouter = Router()
  const protectCsrf = createCsrfProtection(options)
  const requireClienteOwner = requireAccountOwner('cliente')
  // Solo se utiliza después de requireAuthentication: locals contiene una identidad comprobada.
  const requireOwnerOrAdmin: RequestHandler = (req, res, next) => {
    if (res.locals.identity?.tipo === 'admin') return next()
    return requireClienteOwner(req, res, next)
  }

  clienteRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  // El registro admite una sesión anónima, pero exige su token CSRF y un origen permitido.
  clienteRouter.post('/', protectCsrf, add)
  clienteRouter.get('/', requireAccountType('admin'), findAll)
  clienteRouter.get('/:id', requireAuthentication, requireOwnerOrAdmin, findOne)
  // No hay excepción para Admin al modificar una cuenta de Cliente.
  clienteRouter.put('/:id', requireClienteOwner, protectCsrf, update)
  clienteRouter.delete('/:id', requireAuthentication, protectCsrf, (_req, res) => {
    // No se invoca remove ni deleteCliente hasta acordar eliminación y revocación de sesiones.
    res.status(403).json({ message: 'La eliminación de clientes está temporalmente bloqueada' })
  })
  clienteRouter.use(clienteAccessErrorHandler)
  return clienteRouter
}

/** Errores de acceso y de los middlewares previos; los controladores conservan sus respuestas. */
export const clienteAccessErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
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
  res.status(500).json({ message: 'No se pudo comprobar el acceso a clientes' })
}
