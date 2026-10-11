import 'reflect-metadata'
import express from "express"
import {orm, syncSchema} from './shared/db/orm.js'
import { RequestContext } from '@mikro-orm/core'
import { createAdminRouter, adminAccessErrorHandler } from './admin/admin.routes.js'
import { createCategoriaRouter, categoriaAccessErrorHandler } from './categoria/categoria.routes.js'
import { createClienteRouter, clienteAccessErrorHandler } from './cliente/cliente.routes.js'
import { createProductoRouter, productoAccessErrorHandler } from './producto/producto.routes.js'
import { createPedidoRouter } from './pedido/pedido.routes.js'
import { pedidoErrorHandler } from './pedido/pedido.controler.js'
import { createDetallePedidoRouter } from './pedido/detallePedido.routes.js'
import { detallePedidoErrorHandler } from './pedido/detallePedido.controler.js'
import { createMetodoPagoRouter, metodoPagoAccessErrorHandler } from './pedido/metodoPago.routes.js'
import { createMetodoEnvioRouter, metodoEnvioAccessErrorHandler } from './pedido/metodoEnvio.routes.js'
import { createPagoRouter } from './pedido/pago.routes.js'
import { pagoErrorHandler } from './pedido/pago.controler.js'
import { createAuthRouter } from './auth/auth.routes.js'
import { authErrorHandler } from './auth/auth.controler.js'
import { createSessionMiddleware } from './shared/security/session.js'

const app = express()

//middleware
app.use(express.json())

//middleware
app.use((req, res, next) => {
    RequestContext.create(orm.em, next)
 
})

// Una única instancia comparte las sesiones entre auth y los routers de la API.
// Cada router aplica sus permisos; Admin, Cliente, Pedido y Pago ya tienen controles de acceso.
app.use('/api', createSessionMiddleware())

// SESSION_SECRET es obligatorio. En producción también se deben configurar los orígenes.
const configuredOrigins = process.env.CSRF_ALLOWED_ORIGINS
const authOrigins = configuredOrigins === undefined && process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5173', 'http://localhost:3000']
    : (configuredOrigins ?? '').split(',').map(origin => origin.trim()).filter(Boolean)
app.use('/api/auth',
    createAuthRouter({ allowedOrigins: authOrigins }),
    // Captura también errores de sesiones y de express.json(), anteriores al router.
    authErrorHandler,
)

app.use('/api/admins', createAdminRouter({ allowedOrigins: authOrigins }), adminAccessErrorHandler)
app.use('/api/categorias', createCategoriaRouter({ allowedOrigins: authOrigins }), categoriaAccessErrorHandler)
app.use('/api/clientes', createClienteRouter({ allowedOrigins: authOrigins }), clienteAccessErrorHandler)
app.use('/api/productos', createProductoRouter({ allowedOrigins: authOrigins }), productoAccessErrorHandler)
app.use('/api/pedidos', createPedidoRouter({ allowedOrigins: authOrigins }), pedidoErrorHandler)
app.use('/api/detalles-pedido', createDetallePedidoRouter({ allowedOrigins: authOrigins }), detallePedidoErrorHandler)
app.use('/api/metodos-pago', createMetodoPagoRouter({ allowedOrigins: authOrigins }), metodoPagoAccessErrorHandler)
app.use('/api/metodos-envio', createMetodoEnvioRouter({ allowedOrigins: authOrigins }), metodoEnvioAccessErrorHandler)
app.use('/api/pagos', createPagoRouter({ allowedOrigins: authOrigins }), pagoErrorHandler)


app.use((_, res) => {
    return res.status(404).json({ message: 'resource not found' })
})

await syncSchema()//never in production


app.listen(3000, () => {
    console.log("server is running on port http://localhost:3000")

})
