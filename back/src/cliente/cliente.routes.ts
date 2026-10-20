import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './cliente.controler.js'
import { requireAdmin, requireAdminOrSelf } from '../shared/auth.middleware.js'

export const clienteRouter = Router()

clienteRouter.get('/', requireAdmin, findAll)
clienteRouter.get('/:id', requireAdminOrSelf, findOne)
clienteRouter.post('/', add)
clienteRouter.put('/:id', requireAdminOrSelf, update)
clienteRouter.delete('/:id', requireAdmin, remove)
