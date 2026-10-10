import { Router } from 'express';
import { findAll, findOne, add, update, remove } from './metodoPago.controler.js';
export const metodoPagoRouter = Router();
metodoPagoRouter.get('/', findAll);
metodoPagoRouter.get('/:id', findOne);
metodoPagoRouter.post('/', add);
metodoPagoRouter.put('/:id', update);
metodoPagoRouter.delete('/:id', remove);
