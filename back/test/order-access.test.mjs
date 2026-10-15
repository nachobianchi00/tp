import 'reflect-metadata'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { after, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import express from 'express'
import session from 'express-session'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { LockMode } from '@mikro-orm/core'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword } from '../src/shared/security/password.ts'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/order-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-order-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de clientes 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-clientes-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createPedidoRouter, pedidoErrorHandler, findAllPedidos, findPedido, createAuthRouter, authErrorHandler
let createSessionMiddleware, SESSION_TTL_MS, orders, payments, products, details, paymentMethods, shippingMethods, transactionCalls

function matchesValue(actual, expected) {
  if (expected !== null && typeof expected === 'object') {
    if (Object.getPrototypeOf(expected) !== Object.prototype) return actual === expected;
    return actual != null && Object.entries(expected).every(([key, value]) => matchesValue(actual[key], value))
  }
  return actual != null && typeof actual === 'object' ? actual.id === expected : actual === expected
}
function matches(record, Entity, criteria) {
  return record instanceof Entity && Object.entries(criteria).every(([key, value]) => matchesValue(record[key], value))
}
function storedEntities(Entity) {
  for(const [name,list] of [['Pedido',orders],['Pago',payments],['Producto',products],['DetallePedido',details],
    ['MetodoPago',paymentMethods],['MetodoEnvio',shippingMethods]]) if(Entity===entities[name]) return list
  return records
}
function allEntities() { return [...records,...orders,...payments,...products,...details,...paymentMethods,...shippingMethods] }
function collections() {
  return allEntities().flatMap(record=>Object.values(record).filter(value=>value && typeof value.getItems==='function')
    .map(collection=>({collection,items:collection.getItems().slice()})))
}
// Se ejecutan los servicios reales, con transacciones y entidades simuladas exclusivamente en memoria.
const em={
  async count(Entity, criteria) {
    return records.filter(record => record instanceof Entity && record.id === criteria.id).length
  },
  async find(Entity,criteria,options) {
    queries.push({operation:'find',Entity,criteria,options})
    return storedEntities(Entity).filter(record=>matches(record,Entity,criteria))
  },
  async findOne(Entity,criteria,options) {
    queries.push({operation:'findOne',Entity,criteria,options})
    return storedEntities(Entity).find(record=>matches(record,Entity,criteria))??null
  },
  create(Entity,input) {
    assert.ok(Entity===entities.Pedido || Entity===entities.DetallePedido,'Solo se crean pedidos y sus detalles simulados')
    const list=storedEntities(Entity)
    const record=Object.assign(new Entity(),input,{id:Math.max(...list.map(record=>record.id),0)+1})
    list.push(record)
    if(Entity===entities.DetallePedido) record.pedido.detallePedido.add(record)
    writes.created++
    return record
  },
  assign(order,input) { writes.assigned++; Object.assign(order,input) },
  remove(order) {
    assert.ok(order instanceof entities.Pedido,'Solo se eliminan pedidos simulados')
    orders.splice(orders.indexOf(order),1)
    details=details.filter(detail=>detail.pedido!==order)
    writes.removed++
  },
  async flush() { writes.flushed++ },
  async transactional(callback) {
    transactionCalls++
    const previousLists={records:records.slice(),orders:orders.slice(),payments:payments.slice(),products:products.slice(),
      details:details.slice(),paymentMethods:paymentMethods.slice(),shippingMethods:shippingMethods.slice()}
    const previousValues=allEntities().map(record=>({record,value:{...record}}))
    const previousCollections=collections()
    try{return await callback(em)}
    catch(error){
      ({records,orders,payments,products,details,paymentMethods,shippingMethods}=previousLists)
      for(const {record,value} of previousValues){
        for(const key of Object.keys(record)) if(!Object.hasOwn(value,key)) delete record[key]
        for(const [key,old] of Object.entries(value)) if(record[key]!==old) record[key]=old
      }
      for(const {collection,items} of previousCollections){
        const current=collection.getItems()
        if(current.length!==items.length || current.some((item,index)=>item!==items[index])) collection.set(items)
      }
      throw error
    }
  },
}
before(async () => {
  for (const [target, method] of [
    [MikroORM, 'init'],
    ...['connect', 'ensureConnection', 'execute'].map(method => [MySqlConnection.prototype, method]),
  ]) {
    guards.push(mock.method(target, method, () => { throw new Error('No se permite acceder a MySQL') }))
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir),
    'src/pedido/pedido.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ createPedidoRouter } = await load('pedido/pedido.routes.js'))
  ;({ pedidoErrorHandler } = await load('pedido/pedido.controler.js'))
  ;({ findAllPedidos, findPedido } = await load('pedido/pedido.service.js'))
  ;({ createAuthRouter } = await load('auth/auth.routes.js'))
  ;({ authErrorHandler } = await load('auth/auth.controler.js'))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await load('shared/security/session.js'))
  entities = {}
  for (const [name, path] of [
    ['Admin', 'admin/admin.entity.js'], ['Cliente', 'cliente/cliente.entity.js'],
    ['Pedido', 'pedido/pedido.entity.js'], ['DetallePedido', 'pedido/detallePedido.entity.js'],
    ['MetodoPago', 'pedido/metodoPago.entity.js'], ['MetodoEnvio', 'pedido/metodoEnvio.entity.js'],
    ['Pago', 'pedido/pago.entity.js'], ['Producto', 'producto/producto.entity.js'], ['Categoria', 'categoria/categoria.entity.js'],
  ]) entities[name] = (await load(path))[name]
  // Igual que las pruebas de serialización: el constructor descubre metadata sin abrir conexiones.
  metadataOrm = new MikroORM({
    entities: Object.values(entities), entitiesTs: [], metadataProvider: ReflectMetadataProvider,
    dbName: 'minigo_order_access_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_order_access_tests',
    debug: false, metadataCache: { enabled: false }, extensions: [],
  })
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  process.env.SESSION_SECRET = testSecret
  process.env.NODE_ENV = 'test'
  // Un Cliente y un Admin comparten ID para comprobar que el tipo también se respeta.
  records = [
    Object.assign(new entities.Cliente(), { ...newCliente(), id: 7, dni: 30111222, mail: 'cliente@example.test' }),
    Object.assign(new entities.Cliente(), { ...newCliente(), id: 8, dni: 30111223, mail: 'otro-cliente@example.test' }),
    Object.assign(new entities.Admin(), { nombre: 'Admin ficticio', apellido: 'Prueba', id: 7,
      dni: 30111222, mail: 'admin@example.test' }),
  ]
  for (const record of records) record.password = storedHash
  paymentMethods=[1,2,3].map(id=>Object.assign(new entities.MetodoPago(),{id,descripcion:'Metodo '+id,estado:id!==3}))
  shippingMethods=[Object.assign(new entities.MetodoEnvio(),{id:1,descripcion:'Envio ficticio',costo:5,estado:true})]
  products=[[1,10,20],[2,2.5,50]].map(([id,precio,cantidad])=>Object.assign(new entities.Producto(),{
    id,nombre:'Producto '+id,descripcion:'Prueba',precio,cantidad,estado:true}))
  // Pedido 7 es del Cliente 8; Pedido 8 es del Cliente 7. No confundir IDs de recursos y cuentas.
  orders=[[8,0,'pendiente',32.5],[7,1,'pendiente',15],[9,0,'confirmado',25],
    [10,1,'cancelado',15],[11,0,'pendiente',5]].map(([id,owner,estado,total])=>Object.assign(new entities.Pedido(),{
      id,cliente:records[owner],total,estado,fechaCreacion:new Date('2026-10-10T12:00:00Z'),
      metodoPago:paymentMethods[0],metodoEnvio:shippingMethods[0]}))
  details=[[81,0,0,2],[82,0,1,3],[71,1,0,1],[91,2,0,2]].map(([id,order,product,cantidad])=>{
    const detail=Object.assign(new entities.DetallePedido(),{id,pedido:orders[order],producto:products[product],
      cantidad,precioUnitario:products[product].precio})
    detail.pedido.detallePedido.add(detail)
    return detail
  })
  payments=[Object.assign(new entities.Pago(),{id:70,pedido:orders[0],preferenceId:'preference-ficticia',
    externalReference:'referencia-ficticia',estado:'pending',monto:32.5,fechaCreacion:new Date('2026-10-10T12:00:00Z')})]
  orders[0].pago=payments[0]
  transactionCalls=0
  writes={created:0,assigned:0,removed:0,flushed:0}
  queries = []
})

after(async () => {
  try {
    await metadataOrm?.close()
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin MySQL, syncSchema ni eliminación de cuentas')
  } finally {
    ormMock?.restore()
    for (const guard of guards) guard.mock?.restore?.()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

function newCliente(overrides = {}) {
  return { nombre: 'Cliente ficticio', apellido: 'Prueba', dni: 40111222,
    direccion: 'Dirección ficticia 123', telefono: '3410000000',
    mail: 'nuevo-cliente@example.test', password, ...overrides }
}
const getStored = (store, sid) => new Promise((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : resolve(data)))
function cookieFrom(response) {
  const header = response.headers['set-cookie']?.find(value => value.startsWith('minigo.sid='))
  assert.ok(header, 'Debe emitirse la cookie de sesión')
  const pair = header.split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return { pair, sid: value.slice(2, value.lastIndexOf('.')) }
}

function assertSafe(response) {
  assert.match(response.headers['content-type'], /application\/json/)
  assert.equal(response.headers['cache-control'], 'no-store')
  const visit = value => {
    if (value === null || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      assert.equal(['password', 'hash', 'secret', 'stack', 'sessionID', 'sessionId', 'authenticatedAt'].includes(key), false)
      visit(child)
    }
  }
  visit(response.body)
  for (const secret of [password, storedHash, testSecret, internalDetail, '$argon2']) {
    assert.equal(JSON.stringify(response.body).includes(secret), false)
  }
}

function storageState(){
  return {records:records.map(record=>({...record})),orders:orders.map(record=>({...record})),
    payments:payments.map(record=>({...record})),products:products.map(record=>({...record})),
    details:details.map(record=>({...record})),paymentMethods:paymentMethods.map(record=>({...record})),
    shippingMethods:shippingMethods.map(record=>({...record})),
    collections:collections().map(({collection,items})=>({collection,ids:items.map(item=>item.id)}))}
}
function snapshot(){return {storage:storageState(),writes:{...writes},queries:queries.length,transactionCalls}}
function assertNoWrites(before){assert.deepEqual(storageState(),before.storage);assert.deepEqual(writes,before.writes)}
function assertUntouched(before){
  assertNoWrites(before)
  assert.equal(queries.length,before.queries,'Sin permisos o CSRF no se consultan pedidos ni stock')
  assert.equal(transactionCalls,before.transactionCalls)
}

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  // Mismo montaje que index.ts; solo Express aislado, ningún arranque real.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  app.use('/api/pedidos', createPedidoRouter({ allowedOrigins: [origin] }), pedidoErrorHandler)
  // Simula un consumidor público sin cambiar ni proteger ningún otro CRUD del repositorio.
  app.all('/api/probe', (_req, res) => res.json({ ok: true }))
  app.use((_req, res) => res.status(404).json({ message: 'resource not found' }))
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const call = (path, { method = 'GET', cookie, token, sourceOrigin, referer, body, rawBody, headers = {} } = {}) => new Promise((resolve, reject) => {
    const requestHeaders = { ...headers }
    if (cookie) requestHeaders.Cookie = cookie
    if (token) requestHeaders['X-CSRF-Token'] = token
    if (sourceOrigin) requestHeaders.Origin = sourceOrigin
    if (referer) requestHeaders.Referer = referer
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
    if (payload !== undefined) {
      requestHeaders['Content-Type'] ??= 'application/json'
      requestHeaders['Content-Length'] = Buffer.byteLength(payload)
    }
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: requestHeaders, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
  const bootstrap = async () => {
    const response = await call('/api/auth/csrf')
    assert.equal(response.status, 200)
    return { cookie: cookieFrom(response), token: response.body.csrfToken }
  }
  const authenticate = async (tipo = 'cliente', credentials = {}) => {
    const anonymous = await bootstrap()
    const response = await call('/api/auth/login', { method: 'POST', cookie: anonymous.cookie.pair,
      token: anonymous.token, sourceOrigin: origin, body: {
        tipo, mail: tipo === 'admin' ? 'admin@example.test' : 'cliente@example.test', password, ...credentials,
      } })
    assert.equal(response.status, 200)
    return { anonymous, cookie: cookieFrom(response), token: response.body.csrfToken }
  }
  return { store, call, bootstrap, authenticate }
}

function newOrder(overrides = {}) {
  return { cliente: 7, metodoPago: 1, metodoEnvio: 1,
    detallePedido: [{ producto: 1, cantidad: 2 }, { producto: 2, cantidad: 3 }], ...overrides }
}
const operations = [
  ['GET', '/api/pedidos'], ['GET', '/api/pedidos/8'], ['POST', '/api/pedidos'],
  ['PUT', '/api/pedidos/8'], ['POST', '/api/pedidos/8/confirmar'],
  ['POST', '/api/pedidos/8/cancelar'], ['DELETE', '/api/pedidos/11'],
]
const writeOperations = operations.filter(([method]) => method !== 'GET')
const writeBody = (method, path) => path === '/api/pedidos' ? newOrder()
  : method === 'PUT' ? { metodoPago: 2 } : undefined

for (const actor of ['sin sesión', 'sesión anónima']) {
  for (const [method, path] of operations) {
    test(`${actor}: ${method} ${path} devuelve 401 sin consultar ni escribir pedidos`, async t => {
      const { call, bootstrap } = await harness(t)
      const current = actor === 'sesión anónima' ? await bootstrap() : undefined
      const before = snapshot()
      const response = await call(path, { method, cookie: current?.cookie.pair, token: current?.token,
        sourceOrigin: origin, body: writeBody(method, path) })
      assert.equal(response.status, 401)
      assert.deepEqual(response.body, { message: 'No autenticado' })
      assertSafe(response)
      assertUntouched(before)
    })
  }
}

test('Admin lista y consulta cualquier pedido sin CSRF, conserva respuestas y oculta hashes relacionados', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const before = snapshot()
  const list = await call('/api/pedidos', { cookie: cookie.pair })
  assert.equal(list.status, 200)
  assert.equal(list.body.message, 'found all pedidos')
  assert.deepEqual(list.body.data.map(order => order.id), [8, 7, 9, 10, 11])
  assert.deepEqual(queries.at(-1).criteria, {})
  assertSafe(list)
  for (const id of [8, 7]) {
    const single = await call(`/api/pedidos/${id}`, { cookie: cookie.pair })
    assert.equal(single.status, 200)
    assert.deepEqual(single.body, { message: 'found pedido', data: list.body.data.find(order => order.id === id) })
    assertSafe(single)
  }
  assertNoWrites(before)
})

for (const [id, mail, ownIds] of [[7, 'cliente@example.test', [8, 9, 11]], [8, 'otro-cliente@example.test', [7, 10]]]) {
  test(`Cliente ${id}: el listado se filtra en el ORM y solo permite consultar sus pedidos`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie } = await authenticate('cliente', { mail })
    const before = snapshot()
    const list = await call('/api/pedidos?cliente=999&tipo=admin', { cookie: cookie.pair,
      body: { identity: { id: 999, tipo: 'admin' }, cliente: 999 } })
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.data.map(order => order.id), ownIds)
    assert.deepEqual(queries.at(-1).criteria, { cliente: id })
    assert.deepEqual(queries.at(-1).options.populate, ['detallePedido', 'cliente', 'metodoPago', 'metodoEnvio', 'pago'])
    assertSafe(list)
    for (const orderId of ownIds) {
      const single = await call(`/api/pedidos/${orderId}`, { cookie: cookie.pair })
      assert.equal(single.status, 200)
      assert.equal(single.body.message, 'found pedido')
      assert.equal(single.body.data.cliente.id, id)
      assert.deepEqual(queries.at(-1).criteria, { id: orderId, cliente: id })
      assertSafe(single)
    }
    assertNoWrites(before)
  })
}

test('Cliente sin pedidos recibe un listado vacío sin cargar datos ajenos', async t => {
  orders = orders.filter(order => order.cliente.id !== 7)
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  const response = await call('/api/pedidos', { cookie: cookie.pair })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { message: 'found all pedidos', data: [] })
  assert.deepEqual(queries.at(-1).criteria, { cliente: 7 })
  assertSafe(response)
  assertNoWrites(before)
})

for (const [method, suffix] of [['GET', ''], ['PUT', ''], ['POST', '/confirmar'], ['POST', '/cancelar']]) {
  test(`Cliente: ${method} ${suffix || 'individual'} de pedido ajeno o inexistente devuelve el mismo 404 sin escrituras`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    for (const id of [7, 999]) {
      const before = snapshot()
      const response = await call(`/api/pedidos/${id}${suffix}?cliente=7&tipo=admin`, { method, cookie: cookie.pair,
        token, sourceOrigin: origin, body: method === 'PUT' ? { metodoPago: 2 } : { cliente: 7, tipo: 'admin' } })
      assert.equal(response.status, 404)
      assert.deepEqual(response.body, { message: 'Pedido not found' })
      assertSafe(response)
      assertNoWrites(before)
      assert.equal(queries.length - before.queries, 1, 'No se cargan detalles, pagos ni productos del pedido ajeno')
      assert.deepEqual(queries.at(-1).criteria, { id, cliente: 7 })
      if (method !== 'GET') assert.equal(queries.at(-1).options.lockMode, LockMode.PESSIMISTIC_WRITE)
    }
  })
}

test('Cliente no puede eliminar ni siquiera su pedido, con CSRF válido y tipo falsificado', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const response = await call('/api/pedidos/11?tipo=admin', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
  assertSafe(response)
  assertUntouched(before)
})

test('MikroORM instalado genera WHERE por cliente a partir de los filtros del servicio, sin ejecutar SQL', async () => {
  const before = snapshot()
  await findAllPedidos({ id: 7, tipo: 'cliente' })
  await findPedido(8, { id: 7, tipo: 'cliente' })
  for (const query of queries.slice(before.queries)) {
    const qb = metadataOrm.em.fork().createQueryBuilder(entities.Pedido).select('*').where(query.criteria)
    assert.match(qb.getQuery(), /where .*`cliente_id` = \?/i)
    assert.deepEqual(qb.getParams(), query.operation === 'find' ? [7] : [8, 7])
  }
  assertNoWrites(before)
})

for (const suppliedId of [true, false]) {
  test(`Cliente crea para sí mismo ${suppliedId ? 'validando el ID enviado' : 'tomando el ID de la sesión'}, con total calculado`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const body = newOrder({ total: 1, estado: 'confirmado' })
    if (!suppliedId) delete body.cliente
    const response = await call('/api/pedidos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 201)
    assert.equal(response.body.message, 'pedido created')
    assert.equal(response.body.data.cliente.id, 7)
    assert.equal(response.body.data.estado, 'pendiente')
    assert.equal(response.body.data.total, 32.5)
    assertSafe(response)
    assert.equal(orders.at(-1).cliente, records[0])
    assert.equal(orders.at(-1).detallePedido.count(), 2)
    assert.deepEqual(products.map(product => product.cantidad), [20, 50], 'Crear no descuenta stock')
    assert.deepEqual(writes, { created: 3, assigned: 0, removed: 0, flushed: 1 })
  })
}

test('Cliente no puede crear para otro cliente aunque falsifique el tipo; rechazo antes del ORM', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const response = await call('/api/pedidos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: newOrder({ cliente: 8, tipo: 'admin' }) })
  assert.equal(response.status, 403)
  assertSafe(response)
  assertUntouched(before)
})

test('Admin puede crear para el cliente indicado, incluso con un ID distinto del administrador', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const response = await call('/api/pedidos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: newOrder({ cliente: 8 }) })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.cliente.id, 8)
  assertSafe(response)
  assert.equal(orders.at(-1).cliente, records[1])
})

test('POST conserva validaciones de IDs, detalles y existencia de relaciones sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const [expected, body] of [
    [400, null], [400, newOrder({ cliente: undefined })], [400, newOrder({ cliente: '7' })],
    [400, newOrder({ metodoPago: 0 })], [400, newOrder({ metodoEnvio: '1' })],
    [400, newOrder({ detallePedido: [] })], [400, newOrder({ detallePedido: [{ producto: 1, cantidad: 0 }] })],
    [404, newOrder({ cliente: 999 })], [404, newOrder({ metodoPago: 999 })], [404, newOrder({ metodoEnvio: 999 })],
    [404, newOrder({ detallePedido: [{ producto: 999, cantidad: 1 }] })],
    [409, newOrder({ metodoPago: 3 })], [409, newOrder({ detallePedido: [{ producto: 1, cantidad: 21 }] })],
  ]) {
    const before = snapshot()
    const response = await call('/api/pedidos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertNoWrites(before)
  }
})

for (const tipo of ['cliente', 'admin']) {
  test(`PUT ${tipo} actualiza únicamente un metodoPago válido y conserva titular, total y relaciones`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const id = tipo === 'admin' ? 7 : 8
    const order = orders.find(order => order.id === id)
    const previous = { cliente: order.cliente, total: order.total, metodoEnvio: order.metodoEnvio,
      details: order.detallePedido.getItems().slice() }
    const response = await call(`/api/pedidos/${id}`, { method: 'PUT', cookie: cookie.pair, token,
      sourceOrigin: origin, body: { metodoPago: 2 } })
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'pedido updated')
    assertSafe(response)
    assert.equal(order.metodoPago, paymentMethods[1])
    assert.equal(order.cliente, previous.cliente)
    assert.equal(order.total, previous.total)
    assert.equal(order.metodoEnvio, previous.metodoEnvio)
    assert.deepEqual(order.detallePedido.getItems(), previous.details)
    const lookup = queries.find(query => query.Entity === entities.Pedido)
    assert.deepEqual(lookup.criteria, tipo === 'admin' ? { id } : { id, cliente: 7 })
    assert.equal(lookup.options.lockMode, LockMode.PESSIMISTIC_WRITE)
    assert.deepEqual(writes, { created: 0, assigned: 1, removed: 0, flushed: 1 })
    const empty = await call(`/api/pedidos/${id}`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body: {} })
    assert.equal(empty.status, 200, 'Los PUT vacíos conservan su compatibilidad')
  })

  test(`PUT ${tipo} rechaza transferencias, ID, campos protegidos y datos anidados sin cambios parciales`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    for (const body of [{ cliente: 8 }, { cliente: 7 }, { cliente: { id: 8 } }, { id: 7 }, { total: 1 },
      { estado: 'confirmado' }, { detallePedido: [] }, { pago: 70 }, { metodoEnvio: 1 }, { fechaCreacion: 'otro' },
      { campoExtra: true }, { metodoPago: { id: 2, pedidos: [] } }, { metodoPago: 2, cliente: 8 }]) {
      const before = snapshot()
      const response = await call('/api/pedidos/8', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
      assert.equal(response.status, 400)
      assertSafe(response)
      assertNoWrites(before)
    }
  })
}

test('PUT conserva solo pedidos pendientes y valida metodoPago: ID positivo, existencia y estado activo', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [id, expected, body] of [[8, 400, { metodoPago: '2' }], [8, 400, { metodoPago: 0 }],
    [8, 400, { metodoPago: null }], [8, 404, { metodoPago: 999 }], [8, 409, { metodoPago: 3 }],
    [9, 409, { metodoPago: 2 }]]) {
    const before = snapshot()
    const response = await call(`/api/pedidos/${id}`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertNoWrites(before)
  }
})

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo} confirma un pedido autorizado, respetando el bloqueo y descontando stock una sola vez`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const id = tipo === 'admin' ? 7 : 8
    const response = await call(`/api/pedidos/${id}/confirmar`, { method: 'POST', cookie: cookie.pair, token,
      sourceOrigin: origin, body: { cliente: 999, cantidad: 999, estado: 'entregado' } })
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'pedido confirmed and stock deducted')
    assert.equal(response.body.data.estado, 'confirmado')
    assert.deepEqual(products.map(product => product.cantidad), tipo === 'admin' ? [19, 50] : [18, 47])
    assertSafe(response)
    const orderLookup = queries.find(query => query.Entity === entities.Pedido)
    assert.deepEqual(orderLookup.criteria, tipo === 'admin' ? { id } : { id, cliente: 7 })
    assert.equal(orderLookup.options.lockMode, LockMode.PESSIMISTIC_WRITE)
    assert.ok(queries.filter(query => query.Entity === entities.Producto).every(query => query.options.lockMode === LockMode.PESSIMISTIC_WRITE))
    const before = snapshot()
    const repeated = await call(`/api/pedidos/${id}/confirmar`, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(repeated.status, 409)
    assertNoWrites(before)
  })

  test(`${tipo} cancela un pedido pendiente sin modificar stock y conserva la respuesta`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const id = tipo === 'admin' ? 7 : 8
    const response = await call(`/api/pedidos/${id}/cancelar`, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'pedido cancelled')
    assert.equal(response.body.data.estado, 'cancelado')
    assertSafe(response)
    assert.deepEqual(products.map(product => product.cantidad), [20, 50])
    assert.equal(queries.some(query => query.Entity === entities.Producto), false)
  })

  test(`${tipo} cancela un pedido confirmado y repone stock una sola vez`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const response = await call('/api/pedidos/9/cancelar', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 200)
    assert.equal(response.body.data.estado, 'cancelado')
    assert.deepEqual(products.map(product => product.cantidad), [22, 50])
    assertSafe(response)
    const before = snapshot()
    const repeated = await call('/api/pedidos/9/cancelar', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(repeated.status, 409)
    assertNoWrites(before)
  })
}

test('confirmar sin detalles o con producto inactivo mantiene el rechazo sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const id of [11, 8]) {
    if (id === 8) products[0].estado = false
    const before = snapshot()
    const response = await call(`/api/pedidos/${id}/confirmar`, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 409)
    assertSafe(response)
    assertNoWrites(before)
  }
})

test('si falta stock en el segundo producto, la transacción revierte el descuento del primero sin flush', async t => {
  products[1].cantidad = 1
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const response = await call('/api/pedidos/8/confirmar', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 409)
  assertSafe(response)
  assertNoWrites(before)
  assert.equal(writes.flushed, 0)
})

test('cancelar un pedido enviado o entregado mantiene el rechazo del servicio sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const estado of ['enviado', 'entregado']) {
    orders[0].estado = estado
    const before = snapshot()
    const response = await call('/api/pedidos/8/cancelar', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 409)
    assertSafe(response)
    assertNoWrites(before)
  }
})

test('Admin elimina pedidos pendientes o cancelados y conserva el bloqueo de confirmados', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const before = snapshot()
  const denied = await call('/api/pedidos/9', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(denied.status, 409)
  assertNoWrites(before)
  for (const id of [11, 10]) {
    const response = await call(`/api/pedidos/${id}`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: 'pedido deleted' })
    assert.equal(orders.some(order => order.id === id), false)
    assertSafe(response)
  }
  assert.deepEqual(products.map(product => product.cantidad), [20, 50])
  assert.deepEqual(writes, { created: 0, assigned: 0, removed: 2, flushed: 2 })
})

test('Admin conserva 404 para un pedido inexistente en lectura y en todas las operaciones individuales', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const [method, suffix] of [['GET', ''], ['PUT', ''], ['DELETE', ''], ['POST', '/confirmar'], ['POST', '/cancelar']]) {
    const before = snapshot()
    const response = await call(`/api/pedidos/999${suffix}`, { method, cookie: cookie.pair, token, sourceOrigin: origin,
      body: method === 'PUT' ? { metodoPago: 2 } : undefined })
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { message: 'Pedido not found' })
    assertSafe(response)
    assertNoWrites(before)
  }
})

for (const [method, path] of writeOperations) {
  test(`${method} ${path}: rechaza CSRF ausente, alterado o de otra sesión antes del CRUD`, async t => {
    const { call, bootstrap, authenticate } = await harness(t)
    const first = await authenticate('admin')
    const second = await bootstrap()
    const changed = (first.token[0] === 'a' ? 'b' : 'a') + first.token.slice(1)
    for (const token of [undefined, changed, first.anonymous.token, second.token]) {
      const before = snapshot()
      const response = await call(path, { method, cookie: first.cookie.pair, token, sourceOrigin: origin, body: writeBody(method, path) })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`${method} ${path}: exige origen permitido y acepta Referer solo si falta Origin`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate('admin')
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example']) {
      const before = snapshot()
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin,
        referer: sourceOrigin ? `${origin}/pedidos` : undefined, body: writeBody(method, path) })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
    const response = await call(path, { method, cookie: cookie.pair, token, referer: `${origin}/pedidos`, body: writeBody(method, path) })
    assert.equal(response.status, path === '/api/pedidos' ? 201 : 200)
    assertSafe(response)
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`sesión ${tipo} vencida devuelve 401 en todas las rutas, aunque MemoryStore siga activo`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start })
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    t.mock.timers.setTime(start + 20 * 60 * 1000)
    await call('/api/probe', { cookie: cookie.pair })
    t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
    assert.equal((await call('/api/pedidos/8', { cookie: cookie.pair })).status, 200)
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
    const before = snapshot()
    for (const [method, path] of operations) {
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method, path) })
      assert.equal(response.status, 401)
      assertSafe(response)
      assertUntouched(before)
    }
    assert.equal(await getStored(store, cookie.sid), undefined)
  })
}

test('una identidad dañada en la sesión no concede permisos ni inicia transacciones', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const current = await getStored(store, cookie.sid)
  current.identity = { id: 7, tipo: 'intruso' }
  await new Promise((resolve, reject) => store.set(cookie.sid, current, error => error ? reject(error) : resolve()))
  const before = snapshot()
  const response = await call('/api/pedidos/8', { cookie: cookie.pair })
  assert.equal(response.status, 401)
  assertSafe(response)
  assertUntouched(before)
})

test('logout y la cookie anónima anterior al login eliminan el acceso a pedidos', async t => {
  const { call, authenticate } = await harness(t)
  const { anonymous, cookie, token } = await authenticate()
  const before = snapshot()
  assert.equal((await call('/api/pedidos', { cookie: anonymous.cookie.pair })).status, 401)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal((await call('/api/pedidos', { cookie: cookie.pair })).status, 401)
  assertUntouched(before)
})

test('errores internos del almacén de sesiones o del ORM se devuelven como 500 genérico sin escrituras', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const getMock = t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method, path) })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud de pedidos' })
    assertSafe(response)
    assertUntouched(before)
  }
  getMock.mock.restore()
  const mocks = [t.mock.method(em, 'find', () => { throw new TypeError(internalDetail) }),
    t.mock.method(em, 'findOne', () => { throw new TypeError(internalDetail) })]
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method, path) })
    assert.equal(response.status, 500)
    assertSafe(response)
    assertNoWrites(before)
  }
  mocks.forEach(fn => fn.mock.restore())
})

test('errores conocidos del parser y de ID mantienen respuestas 400, 413 y 415 seguras', async t => {
  const { call, authenticate } = await harness(t)
  for (const [expected, options] of [[400, { rawBody: `{"password":"${password}",` }],
    [413, { body: { value: 'a'.repeat(110000) } }],
    [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }]]) {
    const before = snapshot()
    const response = await call('/api/pedidos', { method: 'POST', ...options })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertUntouched(before)
  }
  const { cookie } = await authenticate('admin')
  const before = snapshot()
  const response = await call('/api/pedidos/invalido', { cookie: cookie.pair })
  assert.equal(response.status, 400)
  assertSafe(response)
  assertUntouched(before)
})

test('otros prefijos conservan su acceso y Pedido no agrega métodos ni las URLs con doble barra', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await call('/api/probe', { method })).status, 200)
  }
  const { cookie } = await authenticate('admin')
  assert.equal((await call('/api/pedidos/8', { method: 'PATCH', cookie: cookie.pair })).status, 404)
  assert.equal((await call('/api/pedidos//confirmar', { method: 'POST', cookie: cookie.pair })).status, 404)
})

