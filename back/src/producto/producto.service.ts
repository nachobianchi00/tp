import { orm } from '../shared/db/orm.js'
import { ServiceError, optionalBoolean, requireNonNegativeAmount, requireNonNegativeInteger, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { Categoria } from '../categoria/categoria.entity.js'
import { Producto } from './producto.entity.js'

const em = orm.em

export async function findAllProductos() {
  return em.find(Producto, {}, { populate: ['categorias'] })
}

export async function findProducto(id: number) {
  const producto = await em.findOne(Producto, { id }, { populate: ['categorias'] })
  if (!producto) throw new ServiceError('Producto not found', 404)
  return producto
}

export async function createProducto(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const descripcion = requireString(body.descripcion, 'descripcion')
  const precio = requireNonNegativeAmount(body.precio, 'precio')
  const cantidad = requireNonNegativeInteger(body.cantidad, 'cantidad')
  const estado = optionalBoolean(body.estado, 'estado', true)
  if (precio > 99_999_999.99) {
    throw new ServiceError('precio exceeds the supported amount', 400)
  }

  let categorias: Categoria[] = []
  if (body.categorias !== undefined) {
    if (!Array.isArray(body.categorias)) {
      throw new ServiceError('categorias must be an array of category IDs', 400)
    }
    const categoriaIds = body.categorias.map((id, index) =>
      requirePositiveInteger(id, `categorias[${index}]`),
    )
    if (new Set(categoriaIds).size !== categoriaIds.length) {
      throw new ServiceError('categorias must not contain duplicate IDs', 400)
    }
    categorias = await em.find(Categoria, { id: { $in: categoriaIds } })
    if (categorias.length !== categoriaIds.length) {
      throw new ServiceError('One or more categories were not found', 404)
    }
  }

  const producto = em.create(Producto, { nombre, descripcion, precio, cantidad, estado })
  producto.categorias.set(categorias)
  await em.flush()
  return producto
}

export async function updateProducto(id: number, value: unknown) {
  const producto = await findProducto(id)
  const body = requireRecord(value)
  em.assign(producto, body)
  await em.flush()
  return producto
}

export async function deleteProducto(id: number) {
  const producto = await findProducto(id)
  em.remove(producto)
  await em.flush()
}
