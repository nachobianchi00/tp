import { orm } from '../shared/db/orm.js'
import { ServiceError, requireNonNegativeAmount, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { Pedido } from './pedido.entity.js'
import { EstadoPago, Pago } from './pago.entity.js'
import type { AuthIdentity } from '../auth/auth.service.js'

const em = orm.em

function paymentScope(identity: AuthIdentity) {
  if (!identity || !Number.isSafeInteger(identity.id) || identity.id <= 0
    || (identity.tipo !== 'cliente' && identity.tipo !== 'admin')) {
    throw new ServiceError('No autenticado', 401)
  }
  // MikroORM aplica esta condición en SQL mediante Pago -> Pedido -> Cliente.
  // No se utiliza un ID de cliente enviado en el body, los parámetros o la query.
  return identity.tipo === 'admin' ? {} : { pedido: { cliente: identity.id } }
}

export async function findAllPagos(identity: AuthIdentity) {
  return em.find(Pago, paymentScope(identity), { populate: ['pedido'] })
}

/** Lectura HTTP: la cuenta autenticada limita también la búsqueda de un pago individual. */
export async function findPagoForAccount(id: number, identity: AuthIdentity) {
  const pago = await em.findOne(Pago, { id, ...paymentScope(identity) }, { populate: ['pedido'] })
  // No se distingue entre un pago inexistente y uno perteneciente a otro cliente.
  if (!pago) throw new ServiceError('Pago not found', 404)
  return pago
}

/** Lectura interna del flujo administrativo; las escrituras HTTP exigen Admin antes del controlador. */
export async function findPago(id: number) {
  const pago = await em.findOne(Pago, { id }, { populate: ['pedido'] })
  if (!pago) throw new ServiceError('Pago not found', 404)
  return pago
}

export async function createPago(value: unknown) {
  const body = requireRecord(value)
  const pedidoId = requirePositiveInteger(body.pedido, 'pedido')
  const preferenceId = requireString(body.preferenceId, 'preferenceId')
  const externalReference = requireString(body.externalReference, 'externalReference')

  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(Pedido, { id: pedidoId })
    if (!pedido) throw new ServiceError('Pedido not found', 404)
    if (await transactionalEm.findOne(Pago, { pedido })) {
      throw new ServiceError('A payment already exists for this order', 409)
    }

    const monto = requireNonNegativeAmount(Number(pedido.total), 'pedido total')
    if (body.monto !== undefined && requireNonNegativeAmount(body.monto, 'monto') !== monto) {
      throw new ServiceError('Payment amount must match the order total', 409)
    }

    const pago = transactionalEm.create(Pago, {
      pedido,
      preferenceId,
      externalReference,
      monto,
      estado: EstadoPago.PENDIENTE,
      fechaCreacion: new Date(),
    })
    await transactionalEm.flush()
    return pago
  })
}

export async function updatePago(id: number, value: unknown) {
  const pago = await findPago(id)
  const body = requireRecord(value)
  if ('pedido' in body || 'monto' in body || 'preferenceId' in body || 'externalReference' in body) {
    throw new ServiceError('Payment identity and amount are managed by the payment workflow', 400)
  }
  if (Object.keys(body).some(field => field !== 'estado' && field !== 'statusDetail')) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }

  // null borra el detalle explícitamente; la entidad declara esta columna nullable.
  const input: { estado?: EstadoPago; statusDetail?: string | null } = {}
  if (Object.hasOwn(body, 'estado')) {
    const estado = Object.values(EstadoPago).find(estado => estado === body.estado)
    if (estado === undefined) throw new ServiceError('Invalid payment status', 400)
    input.estado = estado
  }
  if (Object.hasOwn(body, 'statusDetail')) {
    input.statusDetail = body.statusDetail === null || body.statusDetail === ''
      ? null : requireString(body.statusDetail, 'statusDetail')
  }
  // Validar todo antes de asignar. Las transiciones y el estado del pedido se conservan.
  em.assign(pago, input)
  await em.flush()
  return pago
}

export async function deletePago(id: number) {
  const pago = await findPago(id)
  em.remove(pago)
  await em.flush()
}
