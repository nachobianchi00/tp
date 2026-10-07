import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { sendServiceError } from '../shared/service-errors.js'
import { createCliente, deleteCliente, findAllClientes, findCliente, updateCliente } from './cliente.service.js'

async function findAll(_req: Request, res: Response) {
  try {
    res.json({ message: 'found all clientes', data: await findAllClientes() })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function findOne(req: Request, res: Response) {
  try {
    res.json({ message: 'found cliente', data: await findCliente(parseRouteId(req.params.id)) })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function add(req: Request, res: Response) {
  try {
    res.status(201).json({ message: 'cliente created', data: await createCliente(req.body) })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function update(req: Request, res: Response) {
  try {
    res.json({
      message: 'cliente updated',
      data: await updateCliente(parseRouteId(req.params.id), req.body),
    })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function remove(req: Request, res: Response) {
  try {
    await deleteCliente(parseRouteId(req.params.id))
    res.json({ message: 'cliente deleted' })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

export { findAll, findOne, add, update, remove }
