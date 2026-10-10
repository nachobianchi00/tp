import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createMetodoPago, deleteMetodoPago, findAllMetodosPago, findMetodoPago, updateMetodoPago, } from './metodoPago.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all metodos de pago', data: await findAllMetodosPago() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found metodo de pago', data: await findMetodoPago(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'metodo de pago created', data: await createMetodoPago(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'metodo de pago updated',
            data: await updateMetodoPago(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deleteMetodoPago(parseRouteId(req.params.id));
        res.json({ message: 'metodo de pago deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove };
