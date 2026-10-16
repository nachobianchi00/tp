import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import {
  createDetallePedido,
  deleteDetallePedido,
  findAllDetallesPedido,
  findDetallePedido,
  updateDetallePedido,
} from './detallePedido.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all detalles de pedido', data: await findAllDetallesPedido() })
}

async function findOne(req: Request, res: Response) {
  res.json({
    message: 'found detalle de pedido',
    data: await findDetallePedido(parseRouteId(req.params.id)),
  })
}

async function add(req: Request, res: Response) {
  res.status(201).json({
    message: 'detalle de pedido created',
    data: await createDetallePedido(req.body),
  })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'detalle de pedido updated',
    data: await updateDetallePedido(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deleteDetallePedido(parseRouteId(req.params.id))
  res.json({ message: 'detalle de pedido deleted' })
}

export { findAll, findOne, add, update, remove }
