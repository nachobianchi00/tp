import { orm } from '../shared/db/orm.js'
import { optionalBoolean, requireAllowedFields, requireRecord, requireString, AppError } from '../shared/service-errors.js'
import { MetodoPago } from './metodoPago.entity.js'

const em = orm.em

export async function findAllMetodosPago() {
  return em.find(MetodoPago, {})
}

export async function findMetodoPago(id: number) {
  const metodoPago = await em.findOne(MetodoPago, { id })
  if (!metodoPago) throw new AppError('Metodo de pago not found', 404)
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
  const body = requireAllowedFields(value, ['descripcion', 'estado'])
  const updates: Partial<Pick<MetodoPago, 'descripcion' | 'estado'>> = {}
  if ('descripcion' in body) updates.descripcion = requireString(body.descripcion, 'descripcion')
  if ('estado' in body) updates.estado = optionalBoolean(body.estado, 'estado', true)
  em.assign(metodoPago, updates)
  await em.flush()
  return metodoPago
}

export async function deleteMetodoPago(id: number) {
  const metodoPago = await findMetodoPago(id)
  em.remove(metodoPago)
  await em.flush()
}
