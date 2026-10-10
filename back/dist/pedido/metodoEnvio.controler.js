import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createMetodoEnvio, deleteMetodoEnvio, findAllMetodosEnvio, findMetodoEnvio, updateMetodoEnvio, } from './metodoEnvio.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all metodos de envio', data: await findAllMetodosEnvio() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found metodo de envio', data: await findMetodoEnvio(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'metodo de envio created', data: await createMetodoEnvio(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'metodo de envio updated',
            data: await updateMetodoEnvio(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deleteMetodoEnvio(parseRouteId(req.params.id));
        res.json({ message: 'metodo de envio deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove };
