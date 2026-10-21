import { orm } from '../shared/db/orm.js';
import { optionalBoolean, optionalString, requireAllowedFields, requireNonNegativeAmount, requireRecord, requireString, AppError } from '../shared/service-errors.js';
import { MetodoEnvio } from './metodoEnvio.entity.js';
const em = orm.em;
export async function findAllMetodosEnvio() {
    return em.find(MetodoEnvio, {});
}
export async function findMetodoEnvio(id) {
    const metodoEnvio = await em.findOne(MetodoEnvio, { id });
    if (!metodoEnvio)
        throw new AppError('Metodo de envio not found', 404);
    return metodoEnvio;
}
export async function createMetodoEnvio(value) {
    const body = requireRecord(value);
    const costo = requireNonNegativeAmount(body.costo, 'costo');
    if (costo > 99_999_999.99) {
        throw new AppError('costo exceeds the supported amount', 400);
    }
    const metodoEnvio = em.create(MetodoEnvio, {
        descripcion: requireString(body.descripcion, 'descripcion'),
        costo,
        requiereDireccion: optionalBoolean(body.requiereDireccion, 'requiereDireccion', true),
        tiempoEstimado: optionalString(body.tiempoEstimado, 'tiempoEstimado'),
        estado: optionalBoolean(body.estado, 'estado', true),
    });
    await em.flush();
    return metodoEnvio;
}
export async function updateMetodoEnvio(id, value) {
    const metodoEnvio = await findMetodoEnvio(id);
    const body = requireAllowedFields(value, [
        'descripcion', 'costo', 'requiereDireccion', 'tiempoEstimado', 'estado',
    ]);
    const updates = {};
    if ('descripcion' in body)
        updates.descripcion = requireString(body.descripcion, 'descripcion');
    if ('costo' in body) {
        const costo = requireNonNegativeAmount(body.costo, 'costo');
        if (costo > 99_999_999.99)
            throw new AppError('costo exceeds the supported amount', 400);
        updates.costo = costo;
    }
    if ('requiereDireccion' in body) {
        updates.requiereDireccion = optionalBoolean(body.requiereDireccion, 'requiereDireccion', true);
    }
    if ('tiempoEstimado' in body)
        updates.tiempoEstimado = optionalString(body.tiempoEstimado, 'tiempoEstimado');
    if ('estado' in body)
        updates.estado = optionalBoolean(body.estado, 'estado', true);
    em.assign(metodoEnvio, updates);
    await em.flush();
    return metodoEnvio;
}
export async function deleteMetodoEnvio(id) {
    const metodoEnvio = await findMetodoEnvio(id);
    em.remove(metodoEnvio);
    await em.flush();
}
