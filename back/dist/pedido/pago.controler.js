import { parseRouteId } from '../shared/route-params.js';
import { createPago, deletePago, findAllPagos, findPago, updatePago } from './pago.service.js';
async function findAll(_req, res) {
    res.json({ message: 'found all pagos', data: await findAllPagos() });
}
async function findOne(req, res) {
    res.json({ message: 'found pago', data: await findPago(parseRouteId(req.params.id)) });
}
async function add(req, res) {
    res.status(201).json({ message: 'pago created', data: await createPago(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'pago updated',
        data: await updatePago(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deletePago(parseRouteId(req.params.id));
    res.json({ message: 'pago deleted' });
}
export { findAll, findOne, add, update, remove };
