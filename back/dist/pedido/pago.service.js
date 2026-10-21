import { orm } from '../shared/db/orm.js';
import { AppError, requireAllowedFields, requireNonNegativeAmount, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js';
import { Pedido } from './pedido.entity.js';
import { EstadoPago, Pago } from './pago.entity.js';
const em = orm.em;
export async function findAllPagos() {
    return em.find(Pago, {}, { populate: ['pedido'] });
}
export async function findPago(id) {
    const pago = await em.findOne(Pago, { id }, { populate: ['pedido'] });
    if (!pago)
        throw new AppError('Pago not found', 404);
    return pago;
}
export async function createPago(value) {
    const body = requireRecord(value);
    const pedidoId = requirePositiveInteger(body.pedido, 'pedido');
    const preferenceId = requireString(body.preferenceId, 'preferenceId');
    const externalReference = requireString(body.externalReference, 'externalReference');
    return em.transactional(async (transactionalEm) => {
        const pedido = await transactionalEm.findOne(Pedido, { id: pedidoId });
        if (!pedido)
            throw new AppError('Pedido not found', 404);
        if (await transactionalEm.findOne(Pago, { pedido })) {
            throw new AppError('A payment already exists for this order', 409);
        }
        const monto = requireNonNegativeAmount(Number(pedido.total), 'pedido total');
        if (body.monto !== undefined && requireNonNegativeAmount(body.monto, 'monto') !== monto) {
            throw new AppError('Payment amount must match the order total', 409);
        }
        const pago = transactionalEm.create(Pago, {
            pedido,
            preferenceId,
            externalReference,
            monto,
            estado: EstadoPago.PENDIENTE,
            fechaCreacion: new Date(),
        });
        await transactionalEm.flush();
        return pago;
    });
}
export async function updatePago(id, value) {
    const pago = await findPago(id);
    const body = requireAllowedFields(value, ['estado', 'mercadoPagoPaymentId', 'statusDetail', 'fechaAprobacion']);
    const estado = Object.values(EstadoPago).find(value => value === body.estado);
    if (body.estado !== undefined && estado === undefined) {
        throw new AppError('Invalid payment status', 400);
    }
    const updates = {};
    if (estado !== undefined)
        updates.estado = estado;
    if ('mercadoPagoPaymentId' in body) {
        updates.mercadoPagoPaymentId = body.mercadoPagoPaymentId === null
            ? undefined
            : requireString(body.mercadoPagoPaymentId, 'mercadoPagoPaymentId');
    }
    if ('statusDetail' in body) {
        updates.statusDetail = body.statusDetail === null
            ? undefined
            : requireString(body.statusDetail, 'statusDetail');
    }
    if ('fechaAprobacion' in body) {
        if (body.fechaAprobacion === null) {
            updates.fechaAprobacion = undefined;
        }
        else {
            const fechaAprobacion = new Date(requireString(body.fechaAprobacion, 'fechaAprobacion'));
            if (Number.isNaN(fechaAprobacion.getTime())) {
                throw new AppError('fechaAprobacion must be a valid date', 400);
            }
            updates.fechaAprobacion = fechaAprobacion;
        }
    }
    em.assign(pago, updates);
    await em.flush();
    return pago;
}
export async function deletePago(id) {
    const pago = await findPago(id);
    em.remove(pago);
    await em.flush();
}
