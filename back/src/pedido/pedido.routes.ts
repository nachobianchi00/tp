import { Router } from 'express'
import { findAll, findOne, add, update, remove, confirm, cancel } from './pedido.controler.js'
import { requireAdmin, requireAdminOrPedidoOwner, requireAuth, useSessionCliente } from '../shared/auth.middleware.js'

export const pedidoRouter = Router()

pedidoRouter.use(requireAuth)
pedidoRouter.get('/', findAll)
pedidoRouter.get('/:id', requireAdminOrPedidoOwner(req => req.params.id), findOne)
pedidoRouter.post('/', useSessionCliente, add)
pedidoRouter.post('/:id/confirmar', requireAdminOrPedidoOwner(req => req.params.id), confirm)
pedidoRouter.post('/:id/cancelar', requireAdminOrPedidoOwner(req => req.params.id), cancel)
pedidoRouter.put('/:id', requireAdmin, update)
pedidoRouter.delete('/:id', requireAdmin, remove)
