import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import {
  cancelarPedido,
  confirmarPedido,
  createPedido,
  deletePedido,
  findAllPedidos,
  findPedido,
  updatePedido,
} from './pedido.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all pedidos', data: await findAllPedidos() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found pedido', data: await findPedido(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'pedido created', data: await createPedido(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'pedido updated',
    data: await updatePedido(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deletePedido(parseRouteId(req.params.id))
  res.json({ message: 'pedido deleted' })
}

async function confirm(req: Request, res: Response) {
  res.json({
    message: 'pedido confirmed and stock deducted',
    data: await confirmarPedido(parseRouteId(req.params.id)),
  })
}

async function cancel(req: Request, res: Response) {
  res.json({
    message: 'pedido cancelled',
    data: await cancelarPedido(parseRouteId(req.params.id)),
  })
}

export { findAll, findOne, add, update, remove, confirm, cancel }
