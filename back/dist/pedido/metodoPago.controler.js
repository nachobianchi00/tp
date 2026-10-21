import { parseRouteId } from '../shared/route-params.js';
import { createMetodoPago, deleteMetodoPago, findAllMetodosPago, findMetodoPago, updateMetodoPago, } from './metodoPago.service.js';
async function findAll(_req, res) {
    res.json({ message: 'found all metodos de pago', data: await findAllMetodosPago() });
}
async function findOne(req, res) {
    res.json({ message: 'found metodo de pago', data: await findMetodoPago(parseRouteId(req.params.id)) });
}
async function add(req, res) {
    res.status(201).json({ message: 'metodo de pago created', data: await createMetodoPago(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'metodo de pago updated',
        data: await updateMetodoPago(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deleteMetodoPago(parseRouteId(req.params.id));
    res.json({ message: 'metodo de pago deleted' });
}
export { findAll, findOne, add, update, remove };
