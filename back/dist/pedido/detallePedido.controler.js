import { orm } from '../shared/db/orm.js';
import { parseRouteId } from '../shared/route-params.js';
import { DetallePedido } from './detallePedido.entity.js';
const em = orm.em;
async function findAll(_req, res) {
    try {
        const detallesPedido = await em.find(DetallePedido, {}, { populate: ['pedido', 'producto'] });
        res.json({ message: 'found all detalles de pedido', data: detallesPedido });
    }
    catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
}
async function findOne(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const detallePedido = await em.findOneOrFail(DetallePedido, { id }, { populate: ['pedido', 'producto'] });
        res.json({ message: 'found detalle de pedido', data: detallePedido });
    }
    catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
}
async function add(req, res) {
    try {
        const detallePedido = em.create(DetallePedido, req.body);
        await em.flush();
        res.status(201).json({ message: 'detalle de pedido created', data: detallePedido });
    }
    catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
}
async function update(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const detallePedido = await em.findOneOrFail(DetallePedido, { id });
        em.assign(detallePedido, req.body);
        await em.flush();
        res.json({ message: 'detalle de pedido updated', data: detallePedido });
    }
    catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
}
async function remove(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const detallePedido = em.getReference(DetallePedido, id);
        em.remove(detallePedido);
        await em.flush();
        res.json({ message: 'detalle de pedido deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
    }
}
export { findAll, findOne, add, update, remove };
