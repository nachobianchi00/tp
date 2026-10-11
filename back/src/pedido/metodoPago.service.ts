import { orm } from '../shared/db/orm.js'
import { optionalBoolean, requireRecord, requireString, ServiceError } from '../shared/service-errors.js'
import { MetodoPago } from './metodoPago.entity.js'

const em = orm.em

export async function findAllMetodosPago() {
  return em.find(MetodoPago, {})
}

export async function findMetodoPago(id: number) {
  const metodoPago = await em.findOne(MetodoPago, { id })
  if (!metodoPago) throw new ServiceError('Metodo de pago not found', 404)
  return metodoPago
}

export async function createMetodoPago(value: unknown) {
  const body = requireRecord(value)
  const descripcion = requireString(body.descripcion, 'descripcion')
  const estado = optionalBoolean(body.estado, 'estado', true)
  const metodoPago = em.create(MetodoPago, { descripcion, estado })
  await em.flush()
  return metodoPago
}

export async function updateMetodoPago(id: number, value: unknown) {
  const metodoPago = await findMetodoPago(id)
  const body = requireRecord(value)
  if (Object.keys(body).some(field => field !== 'descripcion' && field !== 'estado')) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }

  const input: Partial<Pick<MetodoPago, 'descripcion' | 'estado'>> = {}
  if (Object.hasOwn(body, 'descripcion')) {
    input.descripcion = requireString(body.descripcion, 'descripcion')
  }
  if (Object.hasOwn(body, 'estado')) {
    if (typeof body.estado !== 'boolean') {
      throw new ServiceError('estado must be a boolean', 400)
    }
    input.estado = body.estado
  }
  // Validar todos los campos antes de modificar la entidad, incluso en un PUT parcial.
  em.assign(metodoPago, input)
  await em.flush()
  return metodoPago
}

export async function deleteMetodoPago(id: number) {
  const metodoPago = await findMetodoPago(id)
  em.remove(metodoPago)
  await em.flush()
}
