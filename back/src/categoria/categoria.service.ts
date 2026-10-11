import { FlushMode, IsolationLevel, LockMode, UniqueConstraintViolationException } from '@mikro-orm/core'
import { orm } from '../shared/db/orm.js'
import { isRecord, ServiceError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { Categoria } from './categoria.entity.js'

const em = orm.em

export async function findAllCategorias() {
  return em.find(Categoria, {}, { populate: ['subcategorias', 'productos'] })
}

export async function findCategoria(id: number) {
  const categoria = await em.findOne(Categoria, { id }, { populate: ['subcategorias', 'productos'] })
  if (!categoria) throw new ServiceError('Categoria not found', 404)
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
    throw new ServiceError('A category with this name already exists', 409)
  }

  const categoriaPadre = padreId === undefined
    ? undefined
    : await em.findOne(Categoria, { id: padreId })
  if (padreId !== undefined && !categoriaPadre) {
    throw new ServiceError('Parent category not found', 404)
  }

  const categoria = em.create(Categoria, { nombre, categoriaPadre })
  await em.flush()
  return categoria
}

export async function updateCategoria(id: number, value: unknown) {
  const categoria = await findCategoria(id)
  const body = requireRecord(value)
  if (Object.keys(body).some(field => field !== 'nombre' && field !== 'categoriaPadre')) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }
  const nombre = Object.hasOwn(body, 'nombre') ? requireString(body.nombre, 'nombre') : undefined
  const hasParent = Object.hasOwn(body, 'categoriaPadre')
  const padreId = hasParent ? requireParentReference(body.categoriaPadre) : null

  try {
    if (!hasParent) {
      if (nombre !== undefined) {
        const duplicate = await em.findOne(Categoria, { nombre })
        if (duplicate && duplicate.id !== id) {
          throw new ServiceError('A category with this name already exists', 409)
        }
      }
      em.assign(categoria, nombre === undefined ? {} : { nombre })
      await em.flush()
      return categoria
    }

    return await em.transactional(async tx => {
      const lockOptions = {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        refresh: true,
        populate: false as const,
        flushMode: FlushMode.COMMIT,
      }
      // Todas las modificaciones de jerarquía bloquean primero la menor PK existente.
      // Así esperan en el mismo punto antes de tomar los demás bloqueos (sin tabla nueva).
      const first = await tx.findOne(Categoria, {}, { ...lockOptions, orderBy: { id: 'asc' } })
      if (!first) throw new ServiceError('Categoria not found', 404)
      const rows = await tx.find(Categoria, {}, {
        fields: ['id'], orderBy: { id: 'asc' }, flushMode: FlushMode.COMMIT,
      })
      const ids = rows.map(row => {
        if (row.id === undefined) throw new Error('Invalid persisted category identity')
        return row.id
      }).sort((left, right) => left - right)
      const locked = new Map<number, Categoria>()
      for (const categoryId of ids) {
        const current = categoryId === first.id ? first
          : await tx.findOne(Categoria, { id: categoryId }, lockOptions)
        if (current) locked.set(categoryId, current)
      }

      const current = locked.get(id)
      if (!current) throw new ServiceError('Categoria not found', 404)
      if (nombre !== undefined) {
        // La consulta respeta también la comparación de nombres de la base de datos.
        const duplicate = await tx.findOne(Categoria, { nombre }, { flushMode: FlushMode.COMMIT })
        if (duplicate && duplicate.id !== id) {
          throw new ServiceError('A category with this name already exists', 409)
        }
      }

      const parent = padreId === null ? null : locked.get(padreId)
      if (padreId !== null && !parent) throw new ServiceError('Parent category not found', 404)
      const visited = new Set<number>()
      let ancestor: Categoria | null | undefined = parent
      while (ancestor) {
        const ancestorId = ancestor.id
        if (ancestorId === undefined) throw new Error('Invalid persisted category identity')
        if (ancestorId === id || visited.has(ancestorId)) {
          throw new ServiceError('Category hierarchy cannot contain cycles', 409)
        }
        visited.add(ancestorId)
        const nextId: number | undefined = ancestor.categoriaPadre?.id
        ancestor = nextId === undefined ? null : locked.get(nextId)
        if (nextId !== undefined && !ancestor) {
          throw new ServiceError('Category hierarchy is inconsistent', 409)
        }
      }

      // Preparar la respuesta habitual antes de asignar: ninguna consulta provoca autoflush.
      await tx.populate(current, ['subcategorias', 'productos'])
      tx.assign(current, { ...(nombre === undefined ? {} : { nombre }), categoriaPadre: parent })
      // transactional() guarda al completar el callback; un rechazo no llega a ese flush.
      return current
    }, { clear: true, flushMode: FlushMode.COMMIT, isolationLevel: IsolationLevel.READ_COMMITTED })
  } catch (error) {
    // La restricción UNIQUE sigue siendo la última defensa ante nombres concurrentes.
    if (nombre !== undefined && error instanceof UniqueConstraintViolationException) {
      throw new ServiceError('A category with this name already exists', 409)
    }
    throw error
  }
}

function requireParentReference(value: unknown): number | null {
  if (value === null) return null
  if (isRecord(value)) {
    if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'id')) {
      throw new ServiceError('categoriaPadre must contain only id', 400)
    }
    return requirePositiveInteger(value.id, 'categoriaPadre')
  }
  return requirePositiveInteger(value, 'categoriaPadre')
}

export async function deleteCategoria(id: number) {
  const categoria = await findCategoria(id)
  em.remove(categoria)
  await em.flush()
}
