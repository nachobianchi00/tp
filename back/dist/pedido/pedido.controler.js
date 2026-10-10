import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createPedido, cancelarPedido, confirmarPedido, deletePedido, findAllPedidos, findPedido, updatePedido, } from './pedido.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all pedidos', data: await findAllPedidos() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found pedido', data: await findPedido(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'pedido created', data: await createPedido(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'pedido updated',
            data: await updatePedido(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deletePedido(parseRouteId(req.params.id));
        res.json({ message: 'pedido deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function confirm(req, res) {
    try {
        res.json({
            message: 'pedido confirmed and stock deducted',
            data: await confirmarPedido(parseRouteId(req.params.id)),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function cancel(req, res) {
    try {
        res.json({
            message: 'pedido cancelled',
            data: await cancelarPedido(parseRouteId(req.params.id)),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove, confirm, cancel };
