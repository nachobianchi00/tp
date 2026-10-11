import { Router } from 'express'
import { findAll, findOne, add, update, remove, confirm, cancel, pedidoErrorHandler } from './pedido.controler.js'
import { requireAuthentication, requireAccountType } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'

export function createPedidoRouter(options: { allowedOrigins: readonly string[] }): Router {
  const pedidoRouter = Router()
  const protectCsrf = createCsrfProtection(options)

  pedidoRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  pedidoRouter.use(requireAuthentication)
  // El servicio limita las consultas y comprueba la titularidad dentro de la transacción.
  pedidoRouter.get('/', findAll)
  pedidoRouter.get('/:id', findOne)
  pedidoRouter.post('/', protectCsrf, add)
  pedidoRouter.post('/:id/confirmar', protectCsrf, confirm)
  pedidoRouter.post('/:id/cancelar', protectCsrf, cancel)
  pedidoRouter.put('/:id', protectCsrf, update)
  pedidoRouter.delete('/:id', requireAccountType('admin'), protectCsrf, remove)
  pedidoRouter.use(pedidoErrorHandler)
  return pedidoRouter
}
