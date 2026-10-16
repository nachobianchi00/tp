import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { createProducto, deleteProducto, findAllProductos, findProducto, updateProducto } from './producto.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all productos', data: await findAllProductos() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found producto', data: await findProducto(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'producto created', data: await createProducto(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'producto updated',
    data: await updateProducto(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deleteProducto(parseRouteId(req.params.id))
  res.json({ message: 'producto deleted' })
}

export { findAll, findOne, add, update, remove }
