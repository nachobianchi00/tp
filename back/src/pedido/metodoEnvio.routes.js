import { Router } from 'express';
import { findAll, findOne, add, update, remove } from './metodoEnvio.controler.js';
export const metodoEnvioRouter = Router();
metodoEnvioRouter.get('/', findAll);
metodoEnvioRouter.get('/:id', findOne);
metodoEnvioRouter.post('/', add);
metodoEnvioRouter.put('/:id', update);
metodoEnvioRouter.delete('/:id', remove);
