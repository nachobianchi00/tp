import { orm } from '../shared/db/orm.js';
import { parseRouteId } from '../shared/route-params.js';
import { Pago } from './pago.entity.js';
const em = orm.em;
async function findAll(req, res) {
    try {
        const pagos = await em.find(Pago, {}, { populate: ['pedido'] });
        res.json({ message: 'found all pagos', data: pagos });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function findOne(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pago = await em.findOneOrFail(Pago, { id }, { populate: ['pedido'] });
        res.json({ message: 'found pago', data: pago });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function add(req, res) {
    try {
        const pago = em.create(Pago, req.body);
        await em.flush();
        res.status(201).json({ message: 'pago created', data: pago });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function update(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pago = await em.findOneOrFail(Pago, { id });
        em.assign(pago, req.body);
        await em.flush();
        res.json({ message: 'pago updated', data: pago });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function remove(req, res) {
    try {
        const id = parseRouteId(req.params.id);
        const pago = em.getReference(Pago, id);
        em.remove(pago);
        await em.flush();
        res.json({ message: 'pago deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
export { findAll, findOne, add, update, remove };
