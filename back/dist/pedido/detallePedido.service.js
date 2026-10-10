import { LockMode } from '@mikro-orm/core';
import { orm } from '../shared/db/orm.js';
import { ServiceError, requirePositiveInteger, requireRecord } from '../shared/service-errors.js';
import { Producto } from '../producto/producto.entity.js';
import { DetallePedido } from './detallePedido.entity.js';
import { EstadoPedido, Pedido } from './pedido.entity.js';
const em = orm.em;
function cents(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new ServiceError('Order or product price is invalid', 409);
    }
    return Math.round(amount * 100);
}
async function recalculatePedidoTotal(transactionalEm, pedido, additionalDetails = [], excludedDetailId) {
    const detalles = await transactionalEm.find(DetallePedido, { pedido }, { populate: ['producto'] });
    const costoEnvio = cents(pedido.metodoEnvio.costo);
    const totalEnCentavos = [
        ...detalles.filter(detalle => detalle.id !== excludedDetailId),
        ...additionalDetails,
    ]
        .reduce((total, detalle) => total + cents(detalle.precioUnitario) * detalle.cantidad, costoEnvio);
    if (!Number.isSafeInteger(totalEnCentavos) || totalEnCentavos > 9_999_999_999) {
        throw new ServiceError('Pedido total exceeds the supported amount', 409);
    }
    pedido.total = totalEnCentavos / 100;
}
export async function findAllDetallesPedido() {
    return em.find(DetallePedido, {}, { populate: ['pedido', 'producto'] });
}
export async function findDetallePedido(id) {
    const detalle = await em.findOne(DetallePedido, { id }, { populate: ['pedido', 'producto'] });
    if (!detalle)
        throw new ServiceError('Detalle de pedido not found', 404);
    return detalle;
}
export async function createDetallePedido(value) {
    const body = requireRecord(value);
    const pedidoId = requirePositiveInteger(body.pedido, 'pedido');
    const productoId = requirePositiveInteger(body.producto, 'producto');
    const cantidad = requirePositiveInteger(body.cantidad, 'cantidad');
    return em.transactional(async (transactionalEm) => {
        const [pedido, producto] = await Promise.all([
            transactionalEm.findOne(Pedido, { id: pedidoId }, { populate: ['metodoEnvio'], lockMode: LockMode.PESSIMISTIC_WRITE }),
            transactionalEm.findOne(Producto, { id: productoId }),
        ]);
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (!producto)
            throw new ServiceError('Producto not found', 404);
        if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending orders can be modified', 409);
        }
        if (!producto.estado)
            throw new ServiceError('Producto is inactive', 409);
        const existing = await transactionalEm.find(DetallePedido, { pedido, producto });
        const cantidadSolicitada = existing.reduce((sum, detalle) => sum + detalle.cantidad, cantidad);
        if (!Number.isSafeInteger(cantidadSolicitada) || cantidadSolicitada > producto.cantidad) {
            throw new ServiceError(`Insufficient stock for producto ${productoId}`, 409);
        }
        const precioEnCentavos = cents(producto.precio);
        const detalle = transactionalEm.create(DetallePedido, {
            pedido,
            producto,
            cantidad,
            precioUnitario: precioEnCentavos / 100,
        });
        await recalculatePedidoTotal(transactionalEm, pedido, [detalle]);
        await transactionalEm.flush();
        return detalle;
    });
}
export async function updateDetallePedido(id, value) {
    const body = requireRecord(value);
    if (Object.keys(body).some(field => field !== 'cantidad')) {
        throw new ServiceError('Only cantidad can be changed on a order detail', 400);
    }
    const cantidad = requirePositiveInteger(body.cantidad, 'cantidad');
    return em.transactional(async (transactionalEm) => {
        const detalle = await transactionalEm.findOne(DetallePedido, { id }, { populate: ['pedido', 'producto', 'pedido.metodoEnvio'] });
        if (!detalle)
            throw new ServiceError('Detalle de pedido not found', 404);
        const pedido = await transactionalEm.findOne(Pedido, { id: detalle.pedido.id }, { populate: ['metodoEnvio'], lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending orders can be modified', 409);
        }
        const otherDetails = await transactionalEm.find(DetallePedido, {
            pedido,
            producto: detalle.producto,
            id: { $ne: id },
        });
        const requestedQuantity = otherDetails.reduce((sum, other) => sum + other.cantidad, cantidad);
        if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity > detalle.producto.cantidad) {
            throw new ServiceError(`Insufficient stock for producto ${detalle.producto.id}`, 409);
        }
        detalle.cantidad = cantidad;
        await recalculatePedidoTotal(transactionalEm, pedido, [detalle], detalle.id);
        await transactionalEm.flush();
        return detalle;
    });
}
export async function deleteDetallePedido(id) {
    await em.transactional(async (transactionalEm) => {
        const detalle = await transactionalEm.findOne(DetallePedido, { id }, { populate: ['pedido', 'pedido.metodoEnvio'] });
        if (!detalle)
            throw new ServiceError('Detalle de pedido not found', 404);
        const pedido = await transactionalEm.findOne(Pedido, { id: detalle.pedido.id }, { populate: ['metodoEnvio'], lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!pedido)
            throw new ServiceError('Pedido not found', 404);
        if (pedido.estado !== EstadoPedido.PENDIENTE) {
            throw new ServiceError('Only pending orders can be modified', 409);
        }
        transactionalEm.remove(detalle);
        await recalculatePedidoTotal(transactionalEm, pedido, [], detalle.id);
        await transactionalEm.flush();
    });
}
