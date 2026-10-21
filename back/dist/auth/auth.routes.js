import { Router } from 'express';
import { orm } from '../shared/db/orm.js';
import { Cliente } from '../cliente/cliente.entity.js';
import { Admin } from '../admin/admin.entity.js';
import { AppError, requireRecord, requireString } from '../shared/service-errors.js';
import bcrypt from 'bcryptjs';
import { hashPassword } from '../shared/password.js';
const em = orm.em;
export const authRouter = Router();
authRouter.post('/login', async (req, res) => {
    const body = requireRecord(req.body);
    const mail = requireString(body.mail, 'mail').toLowerCase();
    const password = requireString(body.password, 'password');
    const [admin, cliente] = await Promise.all([
        em.findOne(Admin, { mail }),
        em.findOne(Cliente, { mail }),
    ]);
    if (admin && cliente)
        throw new AppError('invalid credentials', 401);
    const tipo = admin ? 'admin' : 'cliente';
    const user = admin ?? cliente;
    if (!user)
        throw new AppError('invalid credentials', 401);
    const hasStoredHash = /^\$2[aby]\$\d{2}\$/.test(user.password);
    const validPassword = hasStoredHash
        ? await bcrypt.compare(password, user.password)
        : user.password === password;
    if (!validPassword)
        throw new AppError('invalid credentials', 401);
    if (!hasStoredHash) {
        user.password = await hashPassword(password);
        await em.flush();
    }
    await new Promise((resolve, reject) => {
        req.session.regenerate(error => error ? reject(error) : resolve());
    });
    req.session.userId = user.id;
    req.session.tipo = tipo;
    res.json({ message: 'logged in', data: { id: user.id, tipo } });
});
authRouter.get('/me', (req, res) => {
    if (!req.session.userId)
        return res.status(401).json({ message: 'not logged in' });
    res.json({ message: 'me', data: { id: req.session.userId, tipo: req.session.tipo } });
});
authRouter.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ message: 'logged out' });
    });
});
