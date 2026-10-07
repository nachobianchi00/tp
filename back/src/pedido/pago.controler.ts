import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { Pago } from './pago.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const pagos = await em.find(Pago, {}, { populate: ['pedido'] })
    res.json({ message: 'found all pagos', data: pagos })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const pago = await em.findOneOrFail(Pago, { id }, { populate: ['pedido'] })
    res.json({ message: 'found pago', data: pago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const pago = em.create(Pago, req.body)
    await em.flush()
    res.status(201).json({ message: 'pago created', data: pago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const pago = await em.findOneOrFail(Pago, { id })
    em.assign(pago, req.body)
    await em.flush()
    res.json({ message: 'pago updated', data: pago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const pago = em.getReference(Pago, id)
    em.remove(pago)
    await em.flush()
    res.json({ message: 'pago deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
