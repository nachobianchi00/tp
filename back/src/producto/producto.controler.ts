import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { Producto } from './producto.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const productos = await em.find(Producto, {}, { populate: ['categorias'] })
    res.json({ message: 'found all productos', data: productos })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const producto = await em.findOneOrFail(Producto, { id }, { populate: ['categorias'] })
    res.json({ message: 'found producto', data: producto })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const producto = em.create(Producto, req.body)
    await em.flush()
    res.status(201).json({ message: 'producto created', data: producto })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const producto = await em.findOneOrFail(Producto, { id })
    em.assign(producto, req.body)
    await em.flush()
    res.json({ message: 'producto updated', data: producto })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const producto = em.getReference(Producto, id)
    em.remove(producto)
    await em.flush()
    res.json({ message: 'producto deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
