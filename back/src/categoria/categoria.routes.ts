import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './categoria.controler.js'

export const categoriaRouter = Router()

categoriaRouter.get('/', findAll)
categoriaRouter.get('/:id', findOne)
categoriaRouter.post('/', add)
categoriaRouter.put('/:id', update)
categoriaRouter.delete('/:id', remove)
