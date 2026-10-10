import { Router } from 'express'
import { findAll, findOne, add, update, remove, confirm, cancel } from './pedido.controler.js'

export const pedidoRouter = Router()

pedidoRouter.get('/', findAll)
pedidoRouter.get('/:id', findOne)
pedidoRouter.post('/', add)
pedidoRouter.post('/:id/confirmar', confirm)
pedidoRouter.post('/:id/cancelar', cancel)
pedidoRouter.put('/:id', update)
pedidoRouter.delete('/:id', remove)
