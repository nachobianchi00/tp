import { orm } from '../shared/db/orm.js';
import { MetodoEnvio } from './metodoEnvio.entity.js';
const em = orm.em;
async function findAll(req, res) {
    try {
        const metodosEnvio = await em.find(MetodoEnvio, {});
        res.json({ message: 'found all metodos de envio', data: metodosEnvio });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function findOne(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const metodoEnvio = await em.findOneOrFail(MetodoEnvio, { id });
        res.json({ message: 'found metodo de envio', data: metodoEnvio });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function add(req, res) {
    try {
        const metodoEnvio = em.create(MetodoEnvio, req.body);
        await em.flush();
        res.status(201).json({ message: 'metodo de envio created', data: metodoEnvio });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function update(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const metodoEnvio = await em.findOneOrFail(MetodoEnvio, { id });
        em.assign(metodoEnvio, req.body);
        await em.flush();
        res.json({ message: 'metodo de envio updated', data: metodoEnvio });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function remove(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const metodoEnvio = em.getReference(MetodoEnvio, id);
        await em.removeAndFlush(metodoEnvio);
        res.json({ message: 'metodo de envio deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
export { findAll, findOne, add, update, remove };
