import { Request, Response } from 'express'
import { orm } from '../shared/db/orm.js'
import { Categoria } from './categoria.entity.js'

const em = orm.em

async function findAll(req: Request, res: Response) {
  try {
    const categorias = await em.find(Categoria, {}, { populate: ['subcategorias', 'productos'] })
    res.json({ message: 'found all categorias', data: categorias })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function findOne(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id)
    const categoria = await em.findOneOrFail(Categoria, { id }, { populate: ['subcategorias', 'productos'] })
    res.json({ message: 'found categoria', data: categoria })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function add(req: Request, res: Response) {
  try {
    const categoria = em.create(Categoria, req.body)
    await em.flush()
    res.status(201).json({ message: 'categoria created', data: categoria })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function update(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id)
    const categoria = await em.findOneOrFail(Categoria, { id })
    em.assign(categoria, req.body)
    await em.flush()
    res.json({ message: 'categoria updated', data: categoria })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

async function remove(req: Request, res: Response) {
  try {
    const id = Number.parseInt(req.params.id)
    const categoria = em.getReference(Categoria, id)
    await em.removeAndFlush(categoria)
    res.json({ message: 'categoria deleted' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export { findAll, findOne, add, update, remove }
