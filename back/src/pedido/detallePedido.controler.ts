import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { sendServiceError } from '../shared/service-errors.js'
import {
  createDetallePedido,
  deleteDetallePedido,
  findAllDetallesPedido,
  findDetallePedido,
  updateDetallePedido,
} from './detallePedido.service.js'

async function findAll(_req: Request, res: Response) {
  try {
    res.json({ message: 'found all detalles de pedido', data: await findAllDetallesPedido() })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function findOne(req: Request, res: Response) {
  try {
    res.json({
      message: 'found detalle de pedido',
      data: await findDetallePedido(parseRouteId(req.params.id)),
    })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function add(req: Request, res: Response) {
  try {
    res.status(201).json({
      message: 'detalle de pedido created',
      data: await createDetallePedido(req.body),
    })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function update(req: Request, res: Response) {
  try {
    res.json({
      message: 'detalle de pedido updated',
      data: await updateDetallePedido(parseRouteId(req.params.id), req.body),
    })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function remove(req: Request, res: Response) {
  try {
    await deleteDetallePedido(parseRouteId(req.params.id))
    res.json({ message: 'detalle de pedido deleted' })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

export { findAll, findOne, add, update, remove }
