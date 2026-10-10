import { Router } from 'express';
import { findAll, findOne, add, update, remove } from './admin.controler.js';
export const adminRouter = Router();
adminRouter.get('/', findAll);
adminRouter.get('/:id', findOne);
adminRouter.post('/', add);
adminRouter.put('/:id', update);
adminRouter.delete('/:id', remove);
