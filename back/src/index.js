import 'reflect-metadata';
import express from "express";
import { orm, syncSchema } from './shared/db/orm.js';
import { RequestContext } from '@mikro-orm/core';
import { adminRouter } from './admin/admin.routes.js';
import { categoriaRouter } from './categoria/categoria.routes.js';
import { clienteRouter } from './cliente/cliente.routes.js';
import { productoRouter } from './producto/producto.routes.js';
import { pedidoRouter } from './pedido/pedido.routes.js';
import { metodoPagoRouter } from './pedido/metodoPago.routes.js';
import { metodoEnvioRouter } from './pedido/metodoEnvio.routes.js';
import { pagoRouter } from './pedido/pago.routes.js';
const app = express();
//middleware
app.use(express.json());
//middleware
app.use((req, res, next) => {
    RequestContext.create(orm.em, next);
});
app.use('/api/admins', adminRouter);
app.use('/api/categorias', categoriaRouter);
app.use('/api/clientes', clienteRouter);
app.use('/api/productos', productoRouter);
app.use('/api/pedidos', pedidoRouter);
app.use('/api/metodos-pago', metodoPagoRouter);
app.use('/api/metodos-envio', metodoEnvioRouter);
app.use('/api/pagos', pagoRouter);
app.use((_, res) => {
    return res.status(404).json({ message: 'resource not found' });
});
await syncSchema(); //never in production
app.listen(3000, () => {
    console.log("server is running on port http://localhost:3000");
});
