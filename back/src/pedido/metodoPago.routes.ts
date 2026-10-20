import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './metodoPago.controler.js'
import { requireAdmin } from '../shared/auth.middleware.js'

export const metodoPagoRouter = Router()

metodoPagoRouter.get('/', findAll)
metodoPagoRouter.get('/:id', findOne)
metodoPagoRouter.post('/', requireAdmin, add)
metodoPagoRouter.put('/:id', requireAdmin, update)
metodoPagoRouter.delete('/:id', requireAdmin, remove)
