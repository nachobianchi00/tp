import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './categoria.controler.js'
import { requireAdmin } from '../shared/auth.middleware.js'

export const categoriaRouter = Router()

categoriaRouter.get('/', findAll)
categoriaRouter.get('/:id', findOne)
categoriaRouter.post('/', requireAdmin, add)
categoriaRouter.put('/:id', requireAdmin, update)
categoriaRouter.delete('/:id', requireAdmin, remove)
