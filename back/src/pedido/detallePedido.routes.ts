import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './detallePedido.controler.js'

export const detallePedidoRouter = Router()

detallePedidoRouter.get('/', findAll)
detallePedidoRouter.get('/:id', findOne)
detallePedidoRouter.post('/', add)
detallePedidoRouter.put('/:id', update)
detallePedidoRouter.delete('/:id', remove)
