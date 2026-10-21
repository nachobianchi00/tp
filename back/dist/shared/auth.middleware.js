import { orm } from './db/orm.js';
import { Pedido } from '../pedido/pedido.entity.js';
import { parseRouteId } from './route-params.js';
export const requireAuth = (req, res, next) => {
    if (!req.session.userId || !req.session.tipo) {
        return res.status(401).json({ message: 'not logged in' });
    }
    next();
};
export const requireAdmin = (req, res, next) => {
    if (!req.session.userId || req.session.tipo !== 'admin') {
        return res.status(req.session.userId ? 403 : 401).json({
            message: req.session.userId ? 'forbidden' : 'not logged in',
        });
    }
    next();
};
export const requireAdminOrSelf = (req, res, next) => {
    if (!req.session.userId || !req.session.tipo) {
        return res.status(401).json({ message: 'not logged in' });
    }
    if (req.session.tipo !== 'admin' && req.session.userId !== parseRouteId(req.params.id)) {
        return res.status(403).json({ message: 'forbidden' });
    }
    next();
};
export function requireAdminOrPedidoOwner(idFromRequest) {
    return async (req, res, next) => {
        if (!req.session.userId || !req.session.tipo) {
            return res.status(401).json({ message: 'not logged in' });
        }
        if (req.session.tipo === 'admin')
            return next();
        const pedidoId = parseRouteId(idFromRequest(req));
        const pedido = await orm.em.findOne(Pedido, {
            id: pedidoId,
            cliente: { id: req.session.userId },
        });
        if (!pedido)
            return res.status(404).json({ message: 'Pedido not found' });
        next();
    };
}
export const useSessionCliente = (req, res, next) => {
    if (req.session.tipo === 'cliente') {
        req.body = { ...req.body, cliente: req.session.userId };
    }
    next();
};
