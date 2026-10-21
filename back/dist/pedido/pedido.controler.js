import { parseRouteId } from '../shared/route-params.js';
import { cancelarPedido, confirmarPedido, createPedido, deletePedido, findAllPedidos, findPedido, updatePedido, } from './pedido.service.js';
async function findAll(_req, res) {
    const user = _req.session;
    res.json({
        message: 'found all pedidos',
        data: await findAllPedidos(user.tipo === 'admin' ? undefined : user.userId),
    });
}
async function findOne(req, res) {
    res.json({
        message: 'found pedido',
        data: await findPedido(parseRouteId(req.params.id), req.session.tipo === 'admin' ? undefined : req.session.userId),
    });
}
async function add(req, res) {
    res.status(201).json({ message: 'pedido created', data: await createPedido(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'pedido updated',
        data: await updatePedido(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deletePedido(parseRouteId(req.params.id));
    res.json({ message: 'pedido deleted' });
}
async function confirm(req, res) {
    res.json({
        message: 'pedido confirmed and stock deducted',
        data: await confirmarPedido(parseRouteId(req.params.id)),
    });
}
async function cancel(req, res) {
    res.json({
        message: 'pedido cancelled',
        data: await cancelarPedido(parseRouteId(req.params.id)),
    });
}
export { findAll, findOne, add, update, remove, confirm, cancel };
