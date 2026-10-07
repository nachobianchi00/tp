import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { MetodoPago } from './metodoPago.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const metodosPago = await em.find(MetodoPago, {})
    res.json({ message: 'found all metodos de pago', data: metodosPago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoPago = await em.findOneOrFail(MetodoPago, { id })
    res.json({ message: 'found metodo de pago', data: metodoPago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const metodoPago = em.create(MetodoPago, req.body)
    await em.flush()
    res.status(201).json({ message: 'metodo de pago created', data: metodoPago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoPago = await em.findOneOrFail(MetodoPago, { id })
    em.assign(metodoPago, req.body)
    await em.flush()
    res.json({ message: 'metodo de pago updated', data: metodoPago })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoPago = em.getReference(MetodoPago, id)
    em.remove(metodoPago)
    await em.flush()
    res.json({ message: 'metodo de pago deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
