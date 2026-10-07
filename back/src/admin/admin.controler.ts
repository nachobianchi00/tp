import { Request, Response } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { sendServiceError } from '../shared/service-errors.js'
import { createAdmin, deleteAdmin, findAdmin, findAllAdmins, updateAdmin } from './admin.service.js'

async function findAll(_req: Request, res: Response) {
  try {
    res.json({ message: 'found all admins', data: await findAllAdmins() })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function findOne(req: Request, res: Response) {
  try {
    res.json({ message: 'found admin', data: await findAdmin(parseRouteId(req.params.id)) })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function add(req: Request, res: Response) {
  try {
    res.status(201).json({ message: 'admin created', data: await createAdmin(req.body) })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function update(req: Request, res: Response) {
  try {
    res.json({
      message: 'admin updated',
      data: await updateAdmin(parseRouteId(req.params.id), req.body),
    })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

async function remove(req: Request, res: Response) {
  try {
    await deleteAdmin(parseRouteId(req.params.id))
    res.json({ message: 'admin deleted' })
  } catch (error: unknown) {
    sendServiceError(res, error)
  }
}

export { findAll, findOne, add, update, remove }
