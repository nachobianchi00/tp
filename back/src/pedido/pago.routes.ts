import { Router } from 'express'
import { findAll, findOne, add, update, remove, pagoErrorHandler } from './pago.controler.js'
import { requireAuthentication, requireAccountType } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'

export function createPagoRouter(options: { allowedOrigins: readonly string[] }): Router {
  const pagoRouter = Router()
  const protectCsrf = createCsrfProtection(options)
  const requireAdmin = requireAccountType('admin')

  pagoRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  pagoRouter.use(requireAuthentication)
  // La titularidad se comprueba en el servicio mediante la relación del pedido, no el ID del pago.
  pagoRouter.get('/', findAll)
  pagoRouter.get('/:id', findOne)
  pagoRouter.post('/', requireAdmin, protectCsrf, add)
  pagoRouter.put('/:id', requireAdmin, protectCsrf, update)
  pagoRouter.delete('/:id', requireAdmin, protectCsrf, remove)
  pagoRouter.use(pagoErrorHandler)
  return pagoRouter
}
