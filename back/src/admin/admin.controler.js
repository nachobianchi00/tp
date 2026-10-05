import { orm } from '../shared/db/orm.js';
import { Admin } from './admin.entity.js';
const em = orm.em;
async function findAll(req, res) {
    try {
        const admins = await em.find(Admin, {});
        res.json({ message: 'found all admins', data: admins });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function findOne(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const admin = await em.findOneOrFail(Admin, { id });
        res.json({ message: 'found admin', data: admin });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function add(req, res) {
    try {
        const admin = em.create(Admin, req.body);
        await em.flush();
        res.status(201).json({ message: 'admin created', data: admin });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function update(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const admin = await em.findOneOrFail(Admin, { id });
        em.assign(admin, req.body);
        await em.flush();
        res.json({ message: 'admin updated', data: admin });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
async function remove(req, res) {
    try {
        const id = Number.parseInt(req.params.id);
        const admin = em.getReference(Admin, id);
        await em.removeAndFlush(admin);
        res.json({ message: 'admin deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
export { findAll, findOne, add, update, remove };
