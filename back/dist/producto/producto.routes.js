import { Router } from 'express';
import { findAll, findOne, add, update, remove } from './producto.controler.js';
import { requireAdmin } from '../shared/auth.middleware.js';
export const productoRouter = Router();
productoRouter.get('/', findAll);
productoRouter.get('/:id', findOne);
productoRouter.post('/', requireAdmin, add);
productoRouter.put('/:id', requireAdmin, update);
productoRouter.delete('/:id', requireAdmin, remove);
