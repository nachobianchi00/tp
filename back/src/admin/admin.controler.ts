import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { Admin } from './admin.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const admins = await em.find(Admin, {})
    res.json({ message: 'found all admins', data: admins })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const admin = await em.findOneOrFail(Admin, { id })
    res.json({ message: 'found admin', data: admin })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const admin = em.create(Admin, req.body)
    await em.flush()
    res.status(201).json({ message: 'admin created', data: admin })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const admin = await em.findOneOrFail(Admin, { id })
    em.assign(admin, req.body)
    await em.flush()
    res.json({ message: 'admin updated', data: admin })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const admin = em.getReference(Admin, id)
    em.remove(admin)
    await em.flush()
    res.json({ message: 'admin deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
