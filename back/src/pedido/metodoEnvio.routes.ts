import { Router } from 'express'
import { findAll, findOne, add, update, remove } from './metodoEnvio.controler.js'
import { requireAdmin } from '../shared/auth.middleware.js'

export const metodoEnvioRouter = Router()

metodoEnvioRouter.get('/', findAll)
metodoEnvioRouter.get('/:id', findOne)
metodoEnvioRouter.post('/', requireAdmin, add)
metodoEnvioRouter.put('/:id', requireAdmin, update)
metodoEnvioRouter.delete('/:id', requireAdmin, remove)
