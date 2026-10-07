import { orm } from '../shared/db/orm.js'
import { ServiceError, requireNonNegativeAmount, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { Pedido } from './pedido.entity.js'
import { EstadoPago, Pago } from './pago.entity.js'

const em = orm.em

export async function findAllPagos() {
  return em.find(Pago, {}, { populate: ['pedido'] })
}

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
  if (
    body.estado !== undefined &&
    !Object.values(EstadoPago).some(estado => estado === body.estado)
  ) {
    throw new ServiceError('Invalid payment status', 400)
  }
  em.assign(pago, body)
  await em.flush()
  return pago
}

export async function deletePago(id: number) {
  const pago = await findPago(id)
  em.remove(pago)
  await em.flush()
}
