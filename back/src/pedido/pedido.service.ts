import { LockMode } from '@mikro-orm/core'
import { orm } from '../shared/db/orm.js'
import { AppError, optionalString, requireAllowedFields, requirePositiveInteger, requireRecord } from '../shared/service-errors.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { Producto } from '../producto/producto.entity.js'
import { DetallePedido } from './detallePedido.entity.js'
import { EstadoPedido, Pedido } from './pedido.entity.js'
import { MetodoEnvio } from './metodoEnvio.entity.js'
import { MetodoPago } from './metodoPago.entity.js'

const em = orm.em
const MAX_AMOUNT_IN_CENTS = 9_999_999_999

interface DetallePedidoInput {
  producto: number
  cantidad: number
}

interface NuevoPedidoInput {
  cliente: number
  metodoPago: number
  metodoEnvio: number
  observacion?: string
  detallePedido: DetallePedidoInput[]
}

function parseNuevoPedido(value: unknown): NuevoPedidoInput {
  const body = requireRecord(value)
  if (!Array.isArray(body.detallePedido) || body.detallePedido.length === 0) {
    throw new AppError('detallePedido must contain at least one item', 400)
  }

  const detallePedido = body.detallePedido.map((value, index) => {
    const detalle = requireRecord(value)
    return {
      producto: requirePositiveInteger(detalle.producto, `detallePedido[${index}].producto`),
      cantidad: requirePositiveInteger(detalle.cantidad, `detallePedido[${index}].cantidad`),
    }
  })
  return {
    cliente: requirePositiveInteger(body.cliente, 'cliente'),
    metodoPago: requirePositiveInteger(body.metodoPago, 'metodoPago'),
    metodoEnvio: requirePositiveInteger(body.metodoEnvio, 'metodoEnvio'),
    observacion: optionalString(body.observacion, 'observacion'),
    detallePedido,
  }
}

function amountInCents(value: unknown, field: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError(`${field} must be a valid non-negative amount`, 409)
  }
  const cents = Math.round(amount * 100)
  if (cents > MAX_AMOUNT_IN_CENTS) {
    throw new AppError(`${field} exceeds the supported amount`, 409)
  }
  return cents
}

export async function findAllPedidos(clienteId?: number) {
  const where = clienteId === undefined ? {} : { cliente: clienteId }
  return em.find(Pedido, where, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] })
}

export async function findPedido(id: number, clienteId?: number) {
  const where = clienteId === undefined ? { id } : { id, cliente: clienteId }
  const pedido = await em.findOne(Pedido, where, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] })
  if (!pedido) throw new AppError('Pedido not found', 404)
  return pedido
}

export async function createPedido(value: unknown) {
  const input = parseNuevoPedido(value)
  return em.transactional(async transactionalEm => {
    const [cliente, metodoPago, metodoEnvio] = await Promise.all([
      transactionalEm.findOne(Cliente, { id: input.cliente }),
      transactionalEm.findOne(MetodoPago, { id: input.metodoPago }),
      transactionalEm.findOne(MetodoEnvio, { id: input.metodoEnvio }),
    ])
    if (!cliente) throw new AppError('Cliente not found', 404)
    if (!metodoPago) throw new AppError('Metodo de pago not found', 404)
    if (!metodoEnvio) throw new AppError('Metodo de envio not found', 404)
    if (!metodoPago.estado) throw new AppError('Metodo de pago is inactive', 409)
    if (!metodoEnvio.estado) throw new AppError('Metodo de envio is inactive', 409)

    const cantidadesPorProducto = new Map<number, number>()
    for (const detalle of input.detallePedido) {
      const cantidadTotal = (cantidadesPorProducto.get(detalle.producto) ?? 0) + detalle.cantidad
      if (!Number.isSafeInteger(cantidadTotal)) {
        throw new AppError('Total quantity for a product is too large', 400)
      }
      cantidadesPorProducto.set(detalle.producto, cantidadTotal)
    }

    const productos = new Map<number, Producto>()
    for (const [productoId, cantidad] of cantidadesPorProducto) {
      const producto = await transactionalEm.findOne(Producto, { id: productoId })
      if (!producto) throw new AppError(`Producto ${productoId} not found`, 404)
      if (!producto.estado) throw new AppError(`Producto ${productoId} is inactive`, 409)
      if (cantidad > producto.cantidad) {
        throw new AppError(`Insufficient stock for producto ${productoId}`, 409)
      }
      productos.set(productoId, producto)
    }

    let totalEnCentavos = amountInCents(metodoEnvio.costo, 'Metodo de envio cost')
    const pedido = transactionalEm.create(Pedido, {
      cliente,
      metodoPago,
      metodoEnvio,
      observacion: input.observacion,
      estado: EstadoPedido.PENDIENTE,
      fechaCreacion: new Date(),
      total: 0,
    })

    for (const detalleInput of input.detallePedido) {
      const producto = productos.get(detalleInput.producto)
      if (!producto) throw new Error(`Validated product ${detalleInput.producto} was not loaded`)
      const precioEnCentavos = amountInCents(producto.precio, `Producto ${detalleInput.producto} price`)
      totalEnCentavos += precioEnCentavos * detalleInput.cantidad
      if (!Number.isSafeInteger(totalEnCentavos) || totalEnCentavos > MAX_AMOUNT_IN_CENTS) {
        throw new AppError('Pedido total exceeds the supported amount', 409)
      }
      transactionalEm.create(DetallePedido, {
        pedido,
        producto,
        cantidad: detalleInput.cantidad,
        precioUnitario: precioEnCentavos / 100,
      })
    }
    pedido.total = totalEnCentavos / 100
    await transactionalEm.flush()
    return pedido
  })
}

export async function updatePedido(id: number, value: unknown) {
  const body = requireAllowedFields(value, ['cliente', 'metodoPago', 'observacion'])
  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!pedido) throw new AppError('Pedido not found', 404)
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError('Only pending orders can be updated', 409)
    }
    if ('cliente' in body) {
      const clienteId = requirePositiveInteger(body.cliente, 'cliente')
      const cliente = await transactionalEm.findOne(Cliente, { id: clienteId })
      if (!cliente) throw new AppError('Cliente not found', 404)
      pedido.cliente = cliente
    }
    if ('metodoPago' in body) {
      const metodoPagoId = requirePositiveInteger(body.metodoPago, 'metodoPago')
      const metodoPago = await transactionalEm.findOne(MetodoPago, { id: metodoPagoId })
      if (!metodoPago) throw new AppError('Metodo de pago not found', 404)
      if (!metodoPago.estado) throw new AppError('Metodo de pago is inactive', 409)
      pedido.metodoPago = metodoPago
    }
    if ('observacion' in body) pedido.observacion = optionalString(body.observacion, 'observacion')
    await transactionalEm.flush()
    return pedido
  })
}

export async function confirmarPedido(id: number) {
  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!pedido) throw new AppError('Pedido not found', 404)
    if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError('Only pending orders can be confirmed', 409)
    }

    const detalles = await transactionalEm.find(DetallePedido, { pedido })
    if (detalles.length === 0) {
      throw new AppError('An order must contain at least one detail to be confirmed', 409)
    }

    const cantidadesPorProducto = new Map<number, number>()
    for (const detalle of detalles) {
      const productoId = detalle.producto.id
      if (productoId === undefined) throw new Error('Order detail is missing its product ID')
      const cantidad = (cantidadesPorProducto.get(productoId) ?? 0) + detalle.cantidad
      if (!Number.isSafeInteger(cantidad)) {
        throw new AppError(`Requested quantity for producto ${productoId} is too large`, 409)
      }
      cantidadesPorProducto.set(productoId, cantidad)
    }

    for (const [productoId, cantidad] of [...cantidadesPorProducto].sort(([a], [b]) => a - b)) {
      const producto = await transactionalEm.findOne(
        Producto,
        { id: productoId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      if (!producto) throw new AppError(`Producto ${productoId} not found`, 404)
      if (!producto.estado) throw new AppError(`Producto ${productoId} is inactive`, 409)
      if (producto.cantidad < cantidad) {
        throw new AppError(`Insufficient stock for producto ${productoId}`, 409)
      }
      producto.cantidad -= cantidad
    }

    pedido.estado = EstadoPedido.CONFIRMADO
    await transactionalEm.flush()
    return pedido
  })
}

export async function cancelarPedido(id: number) {
  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!pedido) throw new AppError('Pedido not found', 404)

    if (pedido.estado === EstadoPedido.CONFIRMADO) {
      const detalles = await transactionalEm.find(DetallePedido, { pedido })
      const cantidadesPorProducto = new Map<number, number>()
      for (const detalle of detalles) {
        const productoId = detalle.producto.id
        if (productoId === undefined) throw new Error('Order detail is missing its product ID')
        const cantidad = (cantidadesPorProducto.get(productoId) ?? 0) + detalle.cantidad
        if (!Number.isSafeInteger(cantidad)) {
          throw new AppError(`Requested quantity for producto ${productoId} is too large`, 409)
        }
        cantidadesPorProducto.set(productoId, cantidad)
      }

      for (const [productoId, cantidad] of [...cantidadesPorProducto].sort(([a], [b]) => a - b)) {
        const producto = await transactionalEm.findOne(
          Producto,
          { id: productoId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        )
        if (!producto) throw new AppError(`Producto ${productoId} not found`, 404)
        producto.cantidad += cantidad
      }
    } else if (pedido.estado !== EstadoPedido.PENDIENTE) {
      throw new AppError('Only pending or confirmed orders can be cancelled', 409)
    }

    pedido.estado = EstadoPedido.CANCELADO
    await transactionalEm.flush()
    return pedido
  })
}

export async function deletePedido(id: number) {
  await em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!pedido) throw new AppError('Pedido not found', 404)
    if (pedido.estado === EstadoPedido.CONFIRMADO) {
      throw new AppError('Cancel the order before deleting it to restore the reserved stock', 409)
    }
    transactionalEm.remove(pedido)
    await transactionalEm.flush()
  })
}

// Marca un pedido confirmado como entregado.
export async function entregarPedido(id: number) {
  return em.transactional(async transactionalEm => {
    const pedido = await transactionalEm.findOne(
      Pedido,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!pedido) throw new AppError('Pedido not found', 404)
    if (pedido.estado !== EstadoPedido.CONFIRMADO) {
      throw new AppError('Only confirmed orders can be marked as delivered', 409)
    }
    pedido.estado = EstadoPedido.ENTREGADO
    await transactionalEm.flush()
    return pedido
  })
}