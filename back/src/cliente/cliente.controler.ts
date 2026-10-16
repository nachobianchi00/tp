import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { createCliente, deleteCliente, findAllClientes, findCliente, updateCliente } from './cliente.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all clientes', data: await findAllClientes() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found cliente', data: await findCliente(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'cliente created', data: await createCliente(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'cliente updated',
    data: await updateCliente(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deleteCliente(parseRouteId(req.params.id))
  res.json({ message: 'cliente deleted' })
}

export { findAll, findOne, add, update, remove }
