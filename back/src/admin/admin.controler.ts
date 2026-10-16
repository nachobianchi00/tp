import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { createAdmin, deleteAdmin, findAdmin, findAllAdmins, updateAdmin } from './admin.service.js'

async function findAll(_req: Request, res: Response) {
  res.json({ message: 'found all admins', data: await findAllAdmins() })
}

async function findOne(req: Request, res: Response) {
  res.json({ message: 'found admin', data: await findAdmin(parseRouteId(req.params.id)) })
}

async function add(req: Request, res: Response) {
  res.status(201).json({ message: 'admin created', data: await createAdmin(req.body) })
}

async function update(req: Request, res: Response) {
  res.json({
    message: 'admin updated',
    data: await updateAdmin(parseRouteId(req.params.id), req.body),
  })
}

async function remove(req: Request, res: Response) {
  await deleteAdmin(parseRouteId(req.params.id))
  res.json({ message: 'admin deleted' })
}

export { findAll, findOne, add, update, remove }
