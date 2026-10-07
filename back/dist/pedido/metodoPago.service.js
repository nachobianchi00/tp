import { orm } from '../shared/db/orm.js';
import { optionalBoolean, requireRecord, requireString, ServiceError } from '../shared/service-errors.js';
import { MetodoPago } from './metodoPago.entity.js';
const em = orm.em;
export async function findAllMetodosPago() {
    return em.find(MetodoPago, {});
}
export async function findMetodoPago(id) {
    const metodoPago = await em.findOne(MetodoPago, { id });
    if (!metodoPago)
        throw new ServiceError('Metodo de pago not found', 404);
    return metodoPago;
}
export async function createMetodoPago(value) {
    const body = requireRecord(value);
    const descripcion = requireString(body.descripcion, 'descripcion');
    const estado = optionalBoolean(body.estado, 'estado', true);
    const metodoPago = em.create(MetodoPago, { descripcion, estado });
    await em.flush();
    return metodoPago;
}
export async function updateMetodoPago(id, value) {
    const metodoPago = await findMetodoPago(id);
    em.assign(metodoPago, requireRecord(value));
    await em.flush();
    return metodoPago;
}
export async function deleteMetodoPago(id) {
    const metodoPago = await findMetodoPago(id);
    em.remove(metodoPago);
    await em.flush();
}
