import { EntityManager, FlushMode, LockMode } from '@mikro-orm/core'
import { orm } from '../shared/db/orm.js'
import { ServiceError, requirePositiveInteger, requireRecord } from '../shared/service-errors.js'
import { Producto } from '../producto/producto.entity.js'
import { DetallePedido } from './detallePedido.entity.js'
import { EstadoPedido, Pedido } from './pedido.entity.js'
import type { AuthIdentity } from '../auth/auth.service.js'

const em = orm.em

function pedidoScope(identity: AuthIdentity) {
  if (!identity || !Number.isSafeInteger(identity.id) || identity.id <= 0
    || (identity.tipo !== 'cliente' && identity.tipo !== 'admin')) {
    throw new ServiceError('No autenticado', 401)
  }
  return identity.tipo === 'admin' ? {} : { cliente: identity.id }
}

function detalleScope(identity: AuthIdentity) {
  const scope = pedidoScope(identity)
  return identity.tipo === 'admin' ? {} : { pedido: scope }
}

/** Bloquea el pedido y vuelve a leer el detalle para no modificar una relación desactualizada. */
async function loadDetalleForChange(transactionalEm: EntityManager, id: number, identity: AuthIdentity) {
  const candidate = await transactionalEm.findOne(DetallePedido, { id, ...detalleScope(identity) })
  if (!candidate) throw new ServiceError('Detalle de pedido not found', 404)
  const pedidoId = candidate.pedido?.id
  if (pedidoId === undefined || !Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
    throw new Error('Order detail is missing its order ID')
  }
  const scope = pedidoScope(identity)
  const pedido = await transactionalEm.findOne(
    Pedido,
    { id: pedidoId, ...scope },
    { populate: ['metodoEnvio'], lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
  )
  if (!pedido) throw new ServiceError('Detalle de pedido not found', 404)
  const detalle = await transactionalEm.findOne(
    DetallePedido,
    { id, pedido: { id: pedidoId, ...scope } },
    { populate: ['producto'], lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
  )
  if (!detalle) throw new ServiceError('Detalle de pedido not found', 404)
  return { pedido, detalle }
}

function cents(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ServiceError('Order or product price is invalid', 409)
  }
  return Math.round(amount * 100)
}

async function recalculatePedidoTotal(
  transactionalEm: EntityManager,
  pedido: Pedido,
  additionalDetails: DetallePedido[] = [],
  excludedDetailId?: number,
) {
  // Evita guardar antes de validar el total o contar dos veces un detalle recién creado.
  const detalles = await transactionalEm.find(DetallePedido, { pedido }, {
    populate: ['producto'], flushMode: FlushMode.COMMIT,
  })
  const costoEnvio = cents(pedido.metodoEnvio.costo)
  const totalEnCentavos = [
    ...detalles.filter(detalle => detalle.id !== excludedDetailId),
    ...additionalDetails,
  ]
    .reduce(
    (total, detalle) => total + cents(detalle.precioUnitario) * detalle.cantidad,
    costoEnvio,
  )
  if (!Number.isSafeInteger(totalEnCentavos) || totalEnCentavos > 9_999_999_999) {
    throw new ServiceError('Pedido total exceeds the supported amount', 409)
  }
  pedido.total = totalEnCentavos / 100
}

export async function findAllDetallesPedido(identity: AuthIdentity) {
  return em.find(DetallePedido, detalleScope(identity), { populate: ['pedido', 'producto'] })
}

export async function findDetallePedido(id: number, identity: AuthIdentity) {
  const detalle = await em.findOne(DetallePedido, { id, ...detalleScope(identity) }, { populate: ['pedido', 'producto'] })
  if (!detalle) throw new ServiceError('Detalle de pedido not found', 404)
  return detalle
}

export async function createDetallePedido(value: unknown, identity: AuthIdentity) {
  const scope = pedidoScope(identity)
  const body = requireRecord(value)
  const pedidoId = requirePositiveInteger(body.pedido, 'pedido')
  const productoId = requirePositiveInteger(body.producto, 'producto')
  const cantidad = requirePositiveInteger(body.cantidad, 'cantidad')

  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id: pedidoId, ...scope },
      { populate: ['metodoEnvio'], lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    )
    if (!pedido) throw new ServiceError('Pedido not found', 404)
    // El producto solo se consulta después de comprobar y bloquear el pedido autorizado.
    const producto = await transactionalEm.findOne(Producto, { id: productoId }, { refresh: true })
    if (!producto) throw new ServiceError('Producto not found', 404)
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new ServiceError('Only pending orders can be modified', 409)
    }
    if (!producto.estado) throw new ServiceError('Producto is inactive', 409)

    const existing = await transactionalEm.find(DetallePedido, { pedido, producto })
    const cantidadSolicitada = existing.reduce((sum, detalle) => sum + detalle.cantidad, cantidad)
    if (!Number.isSafeInteger(cantidadSolicitada) || cantidadSolicitada > producto.cantidad) {
      throw new ServiceError(`Insufficient stock for producto ${productoId}`, 409)
    }

    const precioEnCentavos = cents(producto.precio)
    const detalle = transactionalEm.create(DetallePedido, {
      pedido,
      producto,
      cantidad,
      precioUnitario: precioEnCentavos / 100,
    })
    await recalculatePedidoTotal(transactionalEm, pedido, [detalle])
    await transactionalEm.flush()
    return detalle
  })
}

export async function updateDetallePedido(id: number, value: unknown, identity: AuthIdentity) {
  detalleScope(identity)
  const body = requireRecord(value)
  if (Object.keys(body).some(field => field !== 'cantidad')) {
    throw new ServiceError('Only cantidad can be changed on a order detail', 400)
  }
  const cantidad = requirePositiveInteger(body.cantidad, 'cantidad')

  return em.transactional(async transactionalEm => {
    const { detalle, pedido } = await loadDetalleForChange(transactionalEm, id, identity)
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new ServiceError('Only pending orders can be modified', 409)
    }
    const otherDetails = await transactionalEm.find(DetallePedido, {
      pedido,
      producto: detalle.producto,
      id: { $ne: id },
    })
    const requestedQuantity = otherDetails.reduce((sum, other) => sum + other.cantidad, cantidad)
    if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity > detalle.producto.cantidad) {
      throw new ServiceError(`Insufficient stock for producto ${detalle.producto.id}`, 409)
    }
    detalle.cantidad = cantidad
    await recalculatePedidoTotal(transactionalEm, pedido, [detalle], detalle.id)
    await transactionalEm.flush()
    return detalle
  })
}

export async function deleteDetallePedido(id: number, identity: AuthIdentity) {
  detalleScope(identity)
  await em.transactional(async transactionalEm => {
    const { detalle, pedido } = await loadDetalleForChange(transactionalEm, id, identity)
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new ServiceError('Only pending orders can be modified', 409)
    }
    transactionalEm.remove(detalle)
    await recalculatePedidoTotal(transactionalEm, pedido, [], detalle.id)
    await transactionalEm.flush()
  })
}
