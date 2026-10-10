import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createProducto, deleteProducto, findAllProductos, findProducto, updateProducto } from './producto.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all productos', data: await findAllProductos() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found producto', data: await findProducto(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'producto created', data: await createProducto(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'producto updated',
            data: await updateProducto(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deleteProducto(parseRouteId(req.params.id));
        res.json({ message: 'producto deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove };
