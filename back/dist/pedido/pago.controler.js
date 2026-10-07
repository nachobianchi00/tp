import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createPago, deletePago, findAllPagos, findPago, updatePago } from './pago.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all pagos', data: await findAllPagos() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found pago', data: await findPago(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'pago created', data: await createPago(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'pago updated',
            data: await updatePago(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deletePago(parseRouteId(req.params.id));
        res.json({ message: 'pago deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove };
