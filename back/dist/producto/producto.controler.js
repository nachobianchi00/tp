import { parseRouteId } from '../shared/route-params.js';
import { createProducto, deleteProducto, findAllProductos, findProducto, updateProducto } from './producto.service.js';
async function findAll(_req, res) {
    res.json({ message: 'found all productos', data: await findAllProductos() });
}
async function findOne(req, res) {
    res.json({ message: 'found producto', data: await findProducto(parseRouteId(req.params.id)) });
}
async function add(req, res) {
    res.status(201).json({ message: 'producto created', data: await createProducto(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'producto updated',
        data: await updateProducto(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deleteProducto(parseRouteId(req.params.id));
    res.json({ message: 'producto deleted' });
}
export { findAll, findOne, add, update, remove };
