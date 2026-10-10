import { LockMode } from '@mikro-orm/core';
import { orm } from '../shared/db/orm.js';
import { ServiceError, requirePositiveInteger, requireRecord } from '../shared/service-errors.js';
import { Cliente } from '../cliente/cliente.entity.js';
import { Producto } from '../producto/producto.entity.js';
import { DetallePedido } from './detallePedido.entity.js';
import { EstadoPedido, Pedido } from './pedido.entity.js';
import { MetodoEnvio } from './metodoEnvio.entity.js';
import { MetodoPago } from './metodoPago.entity.js';
const em = orm.em;
const MAX_AMOUNT_IN_CENTS = 9_999_999_999;
function parseNuevoPedido(value) {
    const body = requireRecord(value);
    if (!Array.isArray(body.detallePedido) || body.detallePedido.length === 0) {
        throw new ServiceError('detallePedido must contain at least one item', 400);
    }
    const detallePedido = body.detallePedido.map((value, index) => {
        const detalle = requireRecord(value);
        return {
            producto: requirePositiveInteger(detalle.producto, `detallePedido[${index}].producto`),
            cantidad: requirePositiveInteger(detalle.cantidad, `detallePedido[${index}].cantidad`),
        };
    });
    return {
        cliente: requirePositiveInteger(body.cliente, 'cliente'),
        metodoPago: requirePositiveInteger(body.metodoPago, 'metodoPago'),
        metodoEnvio: requirePositiveInteger(body.metodoEnvio, 'metodoEnvio'),
        detallePedido,
    };
}
function amountInCents(value, field) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new ServiceError(`${field} must be a valid non-negative amount`, 409);
    }
    const cents = Math.round(amount * 100);
    if (cents > MAX_AMOUNT_IN_CENTS) {
        throw new ServiceError(`${field} exceeds the supported amount`, 409);
    }
    return cents;
}
export async function findAllPedidos() {
    return em.find(Pedido, {}, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] });
}
export async function findPedido(id) {
    const pedido = await em.findOne(Pedido, { id }, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] });
    if (!pedido)
        throw new ServiceError('Pedido not found', 404);
    return pedido;
}
export async function createPedido(value) {
    const input = parseNuevoPedido(value);
    return em.transactional(async (transactionalEm) => {
        const [cliente, metodoPago, metodoEnvio] = await Promise.all([
            transactionalEm.findOne(Cliente, { id: input.cliente }),
            transactionalEm.findOne(MetodoPago, { id: input.metodoPago }),
            transactionalEm.findOne(MetodoEnvio, { id: input.metodoEnvio }),
        ]);
        if (!cliente)
            throw new ServiceError('Cliente not found', 404);
        if (!metodoPago)
            throw new ServiceError('Metodo de pago not found', 404);
        if (!metodoEnvio)
            throw new ServiceError('Metodo de envio not found', 404);
        if (!metodoPago.estado)
            throw new ServiceError('Metodo de pago is inactive', 409);
        if (!metodoEnvio.estado)
            throw new ServiceError('Metodo de envio is inactive', 409);
        const cantidadesPorProducto = new Map();
        for (const detalle of input.detallePedido) {
            const cantidadTotal = (cantidadesPorProducto.get(detalle.producto) ?? 0) + detalle.cantidad;
            if (!Number.isSafeInteger(cantidadTotal)) {
                throw new ServiceError('Total quantity for a product is too large', 400);
            }
            cantidadesPorProducto.set(detalle.producto, cantidadTotal);
        }
        const productos = new Map();
        for (const [productoId, cantidad] of cantidadesPorProducto) {
            const producto = await transactionalEm.findOne(Producto, { id: productoId });
            if (!producto)
                throw new ServiceError(`Producto ${productoId} not found`, 404);
            if (!producto.estado)
                throw new ServiceError(`Producto ${productoId} is inactive`, 409);
            if (cantidad > producto.cantidad) {
                throw new ServiceError(`Insufficient stock for producto ${productoId}`, 409);
            }
            productos.set(productoId, producto);
        }
        let totalEnCentavos = amountInCents(metodoEnvio.costo, 'Metodo de envio cost');
        const pedido = transactionalEm.create(Pedido, {
            cliente,
            metodoPago,
            metodoEnvio,
            estado: EstadoPedido.PENDIENTE,
            fechaCreacion: new Date(),
            total: 0,
        });
        for (const detalleInput of input.detallePedido) {
            const producto = productos.get(detalleInput.producto);
            if (!producto)
                throw new Error(`Validated product ${detalleInput.producto} was not loaded`);
            const precioEnCentavos = amountInCents(producto.precio, `Producto ${detalleInput.producto} price`);
            totalEnCentavos += precioEnCentavos * detalleInput.cantidad;
            if (!Number.isSafeInteger(totalEnCentavos) || totalEnCentavos > MAX_AMOUNT_IN_CENTS) {
                throw new ServiceError('Pedido total exceeds the supported amount', 409);
            }
            transactionalEm.create(DetallePedido, {
                pedido,
                producto,
                cantidad: detalleInput.cantidad,
                precioUnitario: precioEnCentavos / 100,
            });
        }
        pedido.total = totalEnCentavos / 100;
        await transactionalEm.flush();
        return pedido;
    });
}
export async function updatePedido(id, value) {
    const body = requireRecord(value);
    const protectedFields = ['total', 'detallePedido', 'estado', 'fechaCreacion', 'pago', 'metodoEnvio'];
    const attemptedProtectedField = protectedFields.find(field => field in body);
    if (attemptedProtectedField) {
        throw new ServiceError(`${attemptedProtectedField} is managed by the order workflow`, 400);
    }
    return em.transactional(async (transactionalEm) => {
        const pedido = await transactionalEm.findOne(Pedido, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending orders can be updated', 409);
        }
        transactionalEm.assign(pedido, body);
        await transactionalEm.flush();
        return pedido;
    });
}
export async function confirmarPedido(id) {
    return em.transactional(async (transactionalEm) => {
        const pedido = await transactionalEm.findOne(Pedido, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending orders can be confirmed', 409);
        }
        const detalles = await transactionalEm.find(DetallePedido, { pedido });
        if (detalles.length === 0) {
            throw new ServiceError('An order must contain at least one detail to be confirmed', 409);
        }
        const cantidadesPorProducto = new Map();
        for (const detalle of detalles) {
            const productoId = detalle.producto.id;
            if (productoId === undefined)
                throw new Error('Order detail is missing its product ID');
            const cantidad = (cantidadesPorProducto.get(productoId) ?? 0) + detalle.cantidad;
            if (!Number.isSafeInteger(cantidad)) {
                throw new ServiceError(`Requested quantity for producto ${productoId} is too large`, 409);
            }
            cantidadesPorProducto.set(productoId, cantidad);
        }
        for (const [productoId, cantidad] of [...cantidadesPorProducto].sort(([a], [b]) => a - b)) {
            const producto = await transactionalEm.findOne(Producto, { id: productoId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
            if (!producto)
                throw new ServiceError(`Producto ${productoId} not found`, 404);
            if (!producto.estado)
                throw new ServiceError(`Producto ${productoId} is inactive`, 409);
            if (producto.cantidad < cantidad) {
                throw new ServiceError(`Insufficient stock for producto ${productoId}`, 409);
            }
            producto.cantidad -= cantidad;
        }
        pedido.estado = EstadoPedido.CONFIRMADO;
        await transactionalEm.flush();
        return pedido;
    });
}
export async function cancelarPedido(id) {
    return em.transactional(async (transactionalEm) => {
        const pedido = await transactionalEm.findOne(Pedido, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado === EstadoPedido.CONFIRMADO) {
            const detalles = await transactionalEm.find(DetallePedido, { pedido });
            const cantidadesPorProducto = new Map();
            for (const detalle of detalles) {
                const productoId = detalle.producto.id;
                if (productoId === undefined)
                    throw new Error('Order detail is missing its product ID');
                const cantidad = (cantidadesPorProducto.get(productoId) ?? 0) + detalle.cantidad;
                if (!Number.isSafeInteger(cantidad)) {
                    throw new ServiceError(`Requested quantity for producto ${productoId} is too large`, 409);
                }
                cantidadesPorProducto.set(productoId, cantidad);
            }
            for (const [productoId, cantidad] of [...cantidadesPorProducto].sort(([a], [b]) => a - b)) {
                const producto = await transactionalEm.findOne(Producto, { id: productoId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
                if (!producto)
                    throw new ServiceError(`Producto ${productoId} not found`, 404);
                producto.cantidad += cantidad;
            }
        }
        else if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending or confirmed orders can be cancelled', 409);
        }
        pedido.estado = EstadoPedido.CANCELADO;
        await transactionalEm.flush();
        return pedido;
    });
}
export async function deletePedido(id) {
    await em.transactional(async (transactionalEm) => {
        const pedido = await transactionalEm.findOne(Pedido, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado === EstadoPedido.CONFIRMADO) {
            throw new ServiceError('Cancel the order before deleting it to restore the reserved stock', 409);
        }
        transactionalEm.remove(pedido);
        await transactionalEm.flush();
    });
}
