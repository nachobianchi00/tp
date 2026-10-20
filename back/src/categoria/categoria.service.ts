import { orm } from '../shared/db/orm.js'
import { isRecord, AppError, requireAllowedFields, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { Categoria } from './categoria.entity.js'

const em = orm.em

export async function findAllCategorias() {
  return em.find(Categoria, {}, { populate: ['subcategorias', 'productos'] })
}

export async function findCategoria(id: number) {
  const categoria = await em.findOne(Categoria, { id }, { populate: ['subcategorias', 'productos'] })
  if (!categoria) throw new AppError('Categoria not found', 404)
  return categoria
}

export async function createCategoria(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const categoriaPadreValue = isRecord(body.categoriaPadre)
    ? body.categoriaPadre.id
    : body.categoriaPadre
  const padreId = body.categoriaPadre === undefined || body.categoriaPadre === null
    ? undefined
    : requirePositiveInteger(categoriaPadreValue, 'categoriaPadre')

  if (await em.findOne(Categoria, { nombre })) {
    throw new AppError('A category with this name already exists', 409)
  }

  const categoriaPadre = padreId === undefined
    ? undefined
    : await em.findOne(Categoria, { id: padreId })
  if (padreId !== undefined && !categoriaPadre) {
    throw new AppError('Parent category not found', 404)
  }

  const categoria = em.create(Categoria, { nombre, categoriaPadre })
  await em.flush()
  return categoria
}

export async function updateCategoria(id: number, value: unknown) {
  const categoria = await findCategoria(id)
  const body = requireAllowedFields(value, ['nombre', 'categoriaPadre'])
  const updates: { nombre?: string; categoriaPadre?: Categoria | null } = {}
  if ('nombre' in body) {
    const nombre = requireString(body.nombre, 'nombre')
    const existing = await em.findOne(Categoria, { nombre })
    if (existing && existing.id !== id) {
      throw new AppError('A category with this name already exists', 409)
    }
    updates.nombre = nombre
  }
  if ('categoriaPadre' in body) {
    const parentValue = isRecord(body.categoriaPadre)
      ? body.categoriaPadre.id
      : body.categoriaPadre
    if (parentValue === null) {
      updates.categoriaPadre = null
    } else {
      const parentId = requirePositiveInteger(parentValue, 'categoriaPadre')
      if (parentId === id) throw new AppError('A category cannot be its own parent', 400)
      const parent = await em.findOne(Categoria, { id: parentId })
      if (!parent) throw new AppError('Parent category not found', 404)
      updates.categoriaPadre = parent
    }
  }
  em.assign(categoria, updates)
  await em.flush()
  return categoria
}

export async function deleteCategoria(id: number) {
  const categoria = await findCategoria(id)
  em.remove(categoria)
  await em.flush()
}
