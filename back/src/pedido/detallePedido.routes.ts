import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './detallePedido.controler.js'
import { requireAdmin } from '../shared/auth.middleware.js'

export const detallePedidoRouter = Router()

detallePedidoRouter.use(requireAdmin)
detallePedidoRouter.get('/', findAll)
detallePedidoRouter.get('/:id', findOne)
detallePedidoRouter.post('/', add)
detallePedidoRouter.put('/:id', update)
detallePedidoRouter.delete('/:id', remove)
