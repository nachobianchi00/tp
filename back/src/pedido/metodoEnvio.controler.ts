import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import {
  createMetodoEnvio,
  deleteMetodoEnvio,
  findAllMetodosEnvio,
  findMetodoEnvio,
  updateMetodoEnvio,
} from './metodoEnvio.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all metodos de envio', data: await findAllMetodosEnvio() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found metodo de envio', data: await findMetodoEnvio(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'metodo de envio created', data: await createMetodoEnvio(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'metodo de envio updated',
    data: await updateMetodoEnvio(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deleteMetodoEnvio(parseRouteId(req.params.id))
  res.json({ message: 'metodo de envio deleted' })
}

export { findAll, findOne, add, update, remove }
