import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { createPago, deletePago, findAllPagos, findPago, updatePago } from './pago.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all pagos', data: await findAllPagos() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found pago', data: await findPago(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'pago created', data: await createPago(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'pago updated',
    data: await updatePago(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deletePago(parseRouteId(req.params.id))
  res.json({ message: 'pago deleted' })
}

export { findAll, findOne, add, update, remove }
