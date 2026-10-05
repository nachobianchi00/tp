import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './pedido.controler.js'

export const pedidoRouter = Router()

pedidoRouter.get('/', findAll)
pedidoRouter.get('/:id', findOne)
pedidoRouter.post('/', add)
pedidoRouter.put('/:id', update)
pedidoRouter.delete('/:id', remove)
