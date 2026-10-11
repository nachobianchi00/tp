import { Router } from 'express'
import { findAll, findOne, add, update, remove, detallePedidoErrorHandler } from './detallePedido.controler.js'
import { requireAuthentication } from '../shared/security/authorization.js'
import { createCsrfProtection } from '../shared/security/csrf.js'

export function createDetallePedidoRouter(options: { allowedOrigins: readonly string[] }): Router {
  const detallePedidoRouter = Router()
  const protectCsrf = createCsrfProtection(options)

  detallePedidoRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  detallePedidoRouter.use(requireAuthentication)
  // El servicio comprueba la titularidad mediante el pedido, también dentro de cada transacción.
  detallePedidoRouter.get('/', findAll)
  detallePedidoRouter.get('/:id', findOne)
  detallePedidoRouter.post('/', protectCsrf, add)
  detallePedidoRouter.put('/:id', protectCsrf, update)
  detallePedidoRouter.delete('/:id', protectCsrf, remove)
  detallePedidoRouter.use(detallePedidoErrorHandler)
  return detallePedidoRouter
}
