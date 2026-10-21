import { parseRouteId } from '../shared/route-params.js';
import { createCategoria, deleteCategoria, findAllCategorias, findCategoria, updateCategoria } from './categoria.service.js';
async function findAll(_req, res) {
    res.json({ message: 'found all categorias', data: await findAllCategorias() });
}
async function findOne(req, res) {
    res.json({ message: 'found categoria', data: await findCategoria(parseRouteId(req.params.id)) });
}
async function add(req, res) {
    res.status(201).json({ message: 'categoria created', data: await createCategoria(req.body) });
}
async function update(req, res) {
    res.json({
        message: 'categoria updated',
        data: await updateCategoria(parseRouteId(req.params.id), req.body),
    });
}
async function remove(req, res) {
    await deleteCategoria(parseRouteId(req.params.id));
    res.json({ message: 'categoria deleted' });
}
export { findAll, findOne, add, update, remove };
