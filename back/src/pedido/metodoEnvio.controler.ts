import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { MetodoEnvio } from './metodoEnvio.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const metodosEnvio = await em.find(MetodoEnvio, {})
    res.json({ message: 'found all metodos de envio', data: metodosEnvio })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoEnvio = await em.findOneOrFail(MetodoEnvio, { id })
    res.json({ message: 'found metodo de envio', data: metodoEnvio })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const metodoEnvio = em.create(MetodoEnvio, req.body)
    await em.flush()
    res.status(201).json({ message: 'metodo de envio created', data: metodoEnvio })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoEnvio = await em.findOneOrFail(MetodoEnvio, { id })
    em.assign(metodoEnvio, req.body)
    await em.flush()
    res.json({ message: 'metodo de envio updated', data: metodoEnvio })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const metodoEnvio = em.getReference(MetodoEnvio, id)
    em.remove(metodoEnvio)
    await em.flush()
    res.json({ message: 'metodo de envio deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
