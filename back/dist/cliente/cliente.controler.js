import { parseRouteId } from '../shared/route-params.js';
import { createCliente, deleteCliente, findAllClientes, findCliente, updateCliente } from './cliente.service.js';
async function findAll(_req, res) {
    res.json({ message: 'found all clientes', data: await findAllClientes() });
}
async function findOne(req, res) {
    res.json({ message: 'found cliente', data: await findCliente(parseRouteId(req.params.id)) });
}
async function add(req, res) {
    res.status(201).json({ message: 'cliente created', data: await createCliente(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'cliente updated',
        data: await updateCliente(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deleteCliente(parseRouteId(req.params.id));
    res.json({ message: 'cliente deleted' });
}
export { findAll, findOne, add, update, remove };
