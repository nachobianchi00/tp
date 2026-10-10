import { parseRouteId } from '../shared/route-params.js';
import { sendServiceError } from '../shared/service-errors.js';
import { createCategoria, deleteCategoria, findAllCategorias, findCategoria, updateCategoria } from './categoria.service.js';
async function findAll(_req, res) {
    try {
        res.json({ message: 'found all categorias', data: await findAllCategorias() });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function findOne(req, res) {
    try {
        res.json({ message: 'found categoria', data: await findCategoria(parseRouteId(req.params.id)) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function add(req, res) {
    try {
        res.status(201).json({ message: 'categoria created', data: await createCategoria(req.body) });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function update(req, res) {
    try {
        res.json({
            message: 'categoria updated',
            data: await updateCategoria(parseRouteId(req.params.id), req.body),
        });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
async function remove(req, res) {
    try {
        await deleteCategoria(parseRouteId(req.params.id));
        res.json({ message: 'categoria deleted' });
    }
    catch (error) {
        sendServiceError(res, error);
    }
}
export { findAll, findOne, add, update, remove };
