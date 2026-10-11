import { orm } from '../shared/db/orm.js'
import { optionalBoolean, optionalString, requireNonNegativeAmount, requireRecord, requireString, ServiceError } from '../shared/service-errors.js'
import { MetodoEnvio } from './metodoEnvio.entity.js'

const em = orm.em

export async function findAllMetodosEnvio() {
  return em.find(MetodoEnvio, {})
}

export async function findMetodoEnvio(id: number) {
  const metodoEnvio = await em.findOne(MetodoEnvio, { id })
  if (!metodoEnvio) throw new ServiceError('Metodo de envio not found', 404)
  return metodoEnvio
}

export async function createMetodoEnvio(value: unknown) {
  const body = requireRecord(value)
  const costo = requireNonNegativeAmount(body.costo, 'costo')
  if (costo > 99_999_999.99) {
    throw new ServiceError('costo exceeds the supported amount', 400)
  }
  const metodoEnvio = em.create(MetodoEnvio, {
    descripcion: requireString(body.descripcion, 'descripcion'),
    costo,
    requiereDireccion: optionalBoolean(body.requiereDireccion, 'requiereDireccion', true),
    tiempoEstimado: optionalString(body.tiempoEstimado, 'tiempoEstimado'),
    estado: optionalBoolean(body.estado, 'estado', true),
    observacion: optionalString(body.observacion, 'observacion'),
  })
  await em.flush()
  return metodoEnvio
}

export async function updateMetodoEnvio(id: number, value: unknown) {
  const metodoEnvio = await findMetodoEnvio(id)
  const body = requireRecord(value)
  const allowedFields = ['descripcion', 'costo', 'requiereDireccion', 'estado', 'tiempoEstimado', 'observacion']
  if (Object.keys(body).some(field => !allowedFields.includes(field))) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }

  // Los textos nullable usan null para borrar; omitirlos conserva el valor anterior.
  const input: Partial<Pick<MetodoEnvio, 'descripcion' | 'costo' | 'requiereDireccion' | 'estado'>>
    & { tiempoEstimado?: string | null; observacion?: string | null } = {}
  if (Object.hasOwn(body, 'descripcion')) {
    input.descripcion = requireString(body.descripcion, 'descripcion')
  }
  if (Object.hasOwn(body, 'costo')) {
    const costo = requireNonNegativeAmount(body.costo, 'costo')
    if (costo > 99_999_999.99) {
      throw new ServiceError('costo exceeds the supported amount', 400)
    }
    input.costo = costo
  }
  for (const field of ['requiereDireccion', 'estado'] as const) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'boolean') {
        throw new ServiceError(`${field} must be a boolean`, 400)
      }
      input[field] = body[field]
    }
  }
  for (const field of ['tiempoEstimado', 'observacion'] as const) {
    if (Object.hasOwn(body, field)) {
      input[field] = body[field] === null || body[field] === ''
        ? null : requireString(body[field], field)
    }
  }
  // Ningún campo se asigna hasta que se haya validado todo el cuerpo.
  em.assign(metodoEnvio, input)
  await em.flush()
  return metodoEnvio
}

export async function deleteMetodoEnvio(id: number) {
  const metodoEnvio = await findMetodoEnvio(id)
  em.remove(metodoEnvio)
  await em.flush()
}
