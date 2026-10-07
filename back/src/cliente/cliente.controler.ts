import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { parseRouteId } from '../shared/route-params.js'
import { Cliente } from './cliente.entity.js'

const em = orm.em //entitymanager -> para no escribir consultas ssql a mano 

async function findAll(req: Request, res: Response) {
  try {
    const clientes = await em.find(Cliente, {}, { populate: ['pedidos'] })
    res.json({ message: 'found all clientes', data: clientes })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const cliente = await em.findOneOrFail(Cliente, { id }, { populate: ['pedidos'] })
    res.json({ message: 'found cliente', data: cliente })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const cliente = em.create(Cliente, req.body)
    await em.flush()
    res.status(201).json({ message: 'cliente created', data: cliente })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const cliente = await em.findOneOrFail(Cliente, { id })
    em.assign(cliente, req.body)
    await em.flush()
    res.json({ message: 'cliente updated', data: cliente })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = parseRouteId(req.params.id)
    const cliente = em.getReference(Cliente, id)
    em.remove(cliente)
    await em.flush()
    res.json({ message: 'cliente deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
