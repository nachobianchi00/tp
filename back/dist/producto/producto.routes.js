import { Router } from 'express';
import { findAll, findOne, add, update, remove } from './producto.controler.js';
export const productoRouter = Router();
productoRouter.get('/', findAll);
productoRouter.get('/:id', findOne);
productoRouter.post('/', add);
productoRouter.put('/:id', update);
productoRouter.delete('/:id', remove);
