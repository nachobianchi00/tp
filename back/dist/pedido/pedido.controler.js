import { orm } from '../shared/db/orm.js';
import { parseRouteId } from '../shared/route-params.js';
import { Pedido } from './pedido.entity.js';
const em = orm.em;
async function findAll(req, res) {
    try {
        const pedidos = await em.find(Pedido, {}, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] });
        res.json({ message: 'found all pedidos', data: pedidos });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function findOne(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pedido = await em.findOneOrFail(Pedido, { id }, { populate: ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'] });
        res.json({ message: 'found pedido', data: pedido });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function add(req, res) {
    try {
        const pedido = em.create(Pedido, req.body);
        await em.flush();
        res.status(201).json({ message: 'pedido created', data: pedido });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function update(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pedido = await em.findOneOrFail(Pedido, { id });
        em.assign(pedido, req.body);
        await em.flush();
        res.json({ message: 'pedido updated', data: pedido });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function remove(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pedido = em.getReference(Pedido, id);
        em.remove(pedido);
        await em.flush();
        res.json({ message: 'pedido deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
export { findAll, findOne, add, update, remove };
