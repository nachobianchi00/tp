import { orm } from '../shared/db/orm.js';
import { Cliente } from './cliente.entity.js';
const em = orm.em;
async function findAll(req, res) {
    try {
        const clientes = await em.find(Cliente, {}, { populate: ['pedidos'] });
        res.json({ message: 'found all clientes', data: clientes });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function findOne(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const cliente = await em.findOneOrFail(Cliente, { id }, { populate: ['pedidos'] });
        res.json({ message: 'found cliente', data: cliente });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function add(req, res) {
    try {
        const cliente = em.create(Cliente, req.body);
        await em.flush();
        res.status(201).json({ message: 'cliente created', data: cliente });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function update(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const cliente = await em.findOneOrFail(Cliente, { id });
        em.assign(cliente, req.body);
        await em.flush();
        res.json({ message: 'cliente updated', data: cliente });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function remove(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const cliente = em.getReference(Cliente, id);
        await em.removeAndFlush(cliente);
        res.json({ message: 'cliente deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
export { findAll, findOne, add, update, remove };
