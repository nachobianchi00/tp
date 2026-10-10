import { orm } from '../shared/db/orm.js';
import { optionalBoolean, optionalString, requireNonNegativeAmount, requireRecord, requireString, ServiceError } from '../shared/service-errors.js';
import { MetodoEnvio } from './metodoEnvio.entity.js';
const em = orm.em;
export async function findAllMetodosEnvio() {
    return em.find(MetodoEnvio, {});
}
export async function findMetodoEnvio(id) {
    const metodoEnvio = await em.findOne(MetodoEnvio, { id });
    if (!metodoEnvio)
        throw new ServiceError('Metodo de envio not found', 404);
    return metodoEnvio;
}
export async function createMetodoEnvio(value) {
    const body = requireRecord(value);
    const costo = requireNonNegativeAmount(body.costo, 'costo');
    if (costo > 99_999_999.99) {
        throw new ServiceError('costo exceeds the supported amount', 400);
    }
    const metodoEnvio = em.create(MetodoEnvio, {
        descripcion: requireString(body.descripcion, 'descripcion'),
        costo,
        requiereDireccion: optionalBoolean(body.requiereDireccion, 'requiereDireccion', true),
        tiempoEstimado: optionalString(body.tiempoEstimado, 'tiempoEstimado'),
        estado: optionalBoolean(body.estado, 'estado', true),
        observacion: optionalString(body.observacion, 'observacion'),
    });
    await em.flush();
    return metodoEnvio;
}
export async function updateMetodoEnvio(id, value) {
    const metodoEnvio = await findMetodoEnvio(id);
    em.assign(metodoEnvio, requireRecord(value));
    await em.flush();
    return metodoEnvio;
}
export async function deleteMetodoEnvio(id) {
    const metodoEnvio = await findMetodoEnvio(id);
    em.remove(metodoEnvio);
    await em.flush();
}
