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
import { LockMode, FlushMode } from '@mikro-orm/core'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword } from '../src/shared/security/password.ts'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/order-detail-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-order-detail-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de clientes 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-clientes-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let pendingCreates, pendingRemoves;
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createDetallePedidoRouter, detallePedidoErrorHandler, findAllDetallesPedido, findDetallePedido, createAuthRouter, authErrorHandler
let createSessionMiddleware, SESSION_TTL_MS, orders, payments, products, details, paymentMethods, shippingMethods, transactionCalls

function matchesValue(actual, expected) {
  if (expected !== null && typeof expected === 'object') {
    if (Object.hasOwn(expected, '$ne')) return !matchesValue(actual, expected.$ne);
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
  async find(Entity,criteria,options) {
    queries.push({operation:'find',Entity,criteria,options})
    if (Entity === entities.DetallePedido && (pendingCreates.length || pendingRemoves.length)) {
      // Reproduce AUTO: una consulta del mismo tipo puede guardar inserciones/eliminaciones pendientes.
      if (options?.flushMode !== FlushMode.COMMIT) await em.flush()
    }
    return storedEntities(Entity).filter(record=>matches(record,Entity,criteria))
  },
  async findOne(Entity,criteria,options) {
    queries.push({operation:'findOne',Entity,criteria,options})
    return storedEntities(Entity).find(record=>matches(record,Entity,criteria))??null
  },
  create(Entity,input) {
    assert.equal(Entity,entities.DetallePedido);
    const record=Object.assign(new Entity(),input,{id:Math.max(...details.map(d=>d.id),0)+1});
    pendingCreates.push(record);
    writes.created++;
    return record;
  },
  remove(detail) {
    assert.ok(detail instanceof entities.DetallePedido);
    pendingRemoves.push(detail);
    writes.removed++;
  },
  async flush() {
    writes.flushed++;
    for (const detail of pendingCreates) {details.push(detail);detail.pedido.detallePedido.add(detail)}
    // UnitOfWork elimina la referencia inversa sin reasignar la FK no nullable del detalle.
    for (const detail of pendingRemoves) {details.splice(details.indexOf(detail),1);detail.pedido.detallePedido.removeWithoutPropagation(detail)}
    pendingCreates=[];pendingRemoves=[];
  },
  async transactional(callback) {
    transactionCalls++
    const previousLists={records:records.slice(),orders:orders.slice(),payments:payments.slice(),products:products.slice(),
      details:details.slice(),paymentMethods:paymentMethods.slice(),shippingMethods:shippingMethods.slice()}
    const previousPending={created:pendingCreates.slice(),removed:pendingRemoves.slice()};
    const previousValues=allEntities().map(record=>({record,value:{...record}}))
    const previousCollections=collections()
    try{return await callback(em)}
    catch(error){
      pendingCreates=previousPending.created;pendingRemoves=previousPending.removed;
      ({records,orders,payments,products,details,paymentMethods,shippingMethods}=previousLists)
      for(const {record,value} of previousValues){
        for(const key of Object.keys(record)) if(!Object.hasOwn(value,key)) delete record[key]
        for(const [key,old] of Object.entries(value)) if(record[key]!==old) record[key]=old
      }
      for(const {collection,items} of previousCollections){
        const current=collection.getItems()
        if(current.length!==items.length || current.some((item,index)=>item!==items[index])) collection.hydrate(items)
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
    'src/pedido/detallePedido.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ createDetallePedidoRouter } = await load('pedido/detallePedido.routes.js'))
  ;({ detallePedidoErrorHandler } = await load('pedido/detallePedido.controler.js'))
  ;({ findAllDetallesPedido, findDetallePedido } = await load('pedido/detallePedido.service.js'))
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
  pendingCreates=[];pendingRemoves=[];
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
  app.use('/api/detalles-pedido', createDetallePedidoRouter({ allowedOrigins: [origin] }), detallePedidoErrorHandler)
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

const base = '/api/detalles-pedido'
const operations = [['GET', base], ['GET', `${base}/81`], ['POST', base],
  ['PUT', `${base}/81`], ['DELETE', `${base}/81`]]
const writeOperations = operations.filter(([method]) => method !== 'GET')
const newDetail = (overrides = {}) => ({ pedido: 8, producto: 1, cantidad: 1, ...overrides })
const writeBody = method => method === 'POST' ? newDetail() : method === 'PUT' ? { cantidad: 3 } : undefined

for (const anonymous of [false, true]) {
  for (const [method, path] of operations) {
    test(`${anonymous ? 'Sesión anónima' : 'Sin sesión'}: ${method} ${path} devuelve 401 antes del CRUD`, async t => {
      const { call, bootstrap } = await harness(t)
      const current = anonymous ? await bootstrap() : undefined
      const before = snapshot()
      const response = await call(path, { method, cookie: current?.cookie.pair, token: current?.token,
        sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 401)
      assert.deepEqual(response.body, { message: 'No autenticado' })
      assertSafe(response)
      assertUntouched(before)
    })
  }
}

test('Admin lista y consulta cualquier detalle, conservando contratos y ocultando hashes relacionados', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const before = snapshot()
  const list = await call(base, { cookie: cookie.pair })
  assert.equal(list.status, 200)
  assert.equal(list.body.message, 'found all detalles de pedido')
  assert.deepEqual(list.body.data.map(detail => detail.id), [81, 82, 71, 91])
  assert.deepEqual(queries.at(-1).criteria, {})
  assertSafe(list)
  for (const id of [81, 71, 91]) {
    const one = await call(`${base}/${id}`, { cookie: cookie.pair })
    assert.equal(one.status, 200)
    assert.deepEqual(one.body, { message: 'found detalle de pedido', data: list.body.data.find(detail => detail.id === id) })
    assertSafe(one)
  }
  assertNoWrites(before)
})

for (const [id, mail, ownIds, foreignId] of [[7, 'cliente@example.test', [81, 82, 91], 71],
  [8, 'otro-cliente@example.test', [71], 81]]) {
  test(`Cliente ${id}: consultas filtradas en el ORM, pedidos ajenos indistinguibles de inexistentes`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie } = await authenticate('cliente', { mail })
    const before = snapshot()
    const list = await call(`${base}?cliente=999&tipo=admin&pedido=7`, { cookie: cookie.pair,
      body: { identity: { id: 999, tipo: 'admin' } } })
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.data.map(detail => detail.id), ownIds)
    assert.deepEqual(queries.at(-1).criteria, { pedido: { cliente: id } })
    assert.deepEqual(queries.at(-1).options.populate, ['pedido', 'producto'])
    assertSafe(list)
    for (const detailId of ownIds) {
      const one = await call(`${base}/${detailId}`, { cookie: cookie.pair })
      assert.equal(one.status, 200)
      assertSafe(one)
      assert.deepEqual(queries.at(-1).criteria, { id: detailId, pedido: { cliente: id } })
    }
    for (const detailId of [foreignId, 999]) {
      const one = await call(`${base}/${detailId}`, { cookie: cookie.pair })
      assert.equal(one.status, 404)
      assert.deepEqual(one.body, { message: 'Detalle de pedido not found' })
      assertSafe(one)
    }
    assertNoWrites(before)
  })
}

test('El listado vacío conserva 200 y un array vacío', async t => {
  details = details.filter(detail => detail.pedido.cliente.id !== 7)
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const response = await call(base, { cookie: cookie.pair })
  assert.deepEqual(response.body, { message: 'found all detalles de pedido', data: [] })
  assert.equal(response.status, 200)
})

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: POST autorizado conserva precio del servidor, stock y suma el detalle exactamente una vez`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const order = orders[tipo === 'admin' ? 1 : 0]
    const originalTotal = order.total
    const response = await call(base, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
      body: newDetail({ pedido: order.id, precioUnitario: 999, cliente: 999, estado: 'confirmado' }) })
    assert.equal(response.status, 201)
    assert.equal(response.body.message, 'detalle de pedido created')
    assert.equal(response.body.data.precioUnitario, 10)
    assert.equal(details.at(-1).pedido, order)
    assert.equal(order.total, originalTotal + 10)
    assert.deepEqual(products.map(product => product.cantidad), [20, 50])
    assert.deepEqual(writes, { created: 1, assigned: 0, removed: 0, flushed: 1 })
    const lookup = queries.find(query => query.Entity === entities.Pedido)
    assert.deepEqual(lookup.criteria, tipo === 'admin' ? { id: order.id } : { id: order.id, cliente: 7 })
    assert.equal(lookup.options.lockMode, LockMode.PESSIMISTIC_WRITE)
    assert.equal(lookup.options.refresh, true)
    assertSafe(response)
  })

  test(`${tipo}: PUT cambia cantidad y total; conserva pedido, producto y precio histórico`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const detail = details.find(detail => detail.id === (tipo === 'admin' ? 71 : 81))
    const { pedido, producto, precioUnitario } = detail
    const expectedTotal = pedido.total + (4 - detail.cantidad) * precioUnitario
    producto.precio = 20 // El precio del catálogo puede cambiar; el detalle mantiene su precio original.
    const response = await call(`${base}/${detail.id}`, { method: 'PUT', cookie: cookie.pair, token,
      sourceOrigin: origin, body: { cantidad: 4 } })
    assert.equal(response.status, 200)
    assert.equal(response.body.message, 'detalle de pedido updated')
    assert.equal(detail.cantidad, 4)
    assert.equal(detail.pedido, pedido)
    assert.equal(detail.producto, producto)
    assert.equal(detail.precioUnitario, precioUnitario)
    assert.equal(pedido.total, expectedTotal)
    assert.deepEqual(products.map(product => product.cantidad), [20, 50])
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 0, flushed: 1 })
    const locked = queries.filter(query => query.options?.lockMode === LockMode.PESSIMISTIC_WRITE)
    assert.deepEqual(locked.map(query => query.Entity), [entities.Pedido, entities.DetallePedido])
    assert.ok(locked.every(query => query.options.refresh === true))
    assert.deepEqual(locked[1].criteria, { id: detail.id, pedido: { id: pedido.id, ...(tipo === 'cliente' ? { cliente: 7 } : {}) } })
    assertSafe(response)
  })

  test(`${tipo}: DELETE autorizado elimina solo el detalle y recalcula el total sin cambiar stock`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const detail = details.find(detail => detail.id === (tipo === 'admin' ? 71 : 81))
    const expectedTotal = detail.pedido.total - detail.cantidad * detail.precioUnitario
    const accountsBefore = records.slice(), ordersBefore = orders.slice(), paymentsBefore = payments.slice()
    const response = await call(`${base}/${detail.id}`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: 'detalle de pedido deleted' })
    assert.equal(details.includes(detail), false)
    assert.equal(detail.pedido.detallePedido.contains(detail), false)
    assert.equal(detail.pedido.total, expectedTotal)
    assert.deepEqual(records, accountsBefore)
    assert.deepEqual(orders, ordersBefore)
    assert.deepEqual(payments, paymentsBefore)
    assert.deepEqual(products.map(product => product.cantidad), [20, 50])
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 1, flushed: 1 })
    assertSafe(response)
  })

  test(`${tipo}: PUT no transfiere el pedido ni admite campos fuera de cantidad`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    for (const body of [{ pedido: 7 }, { pedido: 8, cantidad: 3 }, { pedido: { id: 8 } },
      { producto: 2 }, { precioUnitario: 1 }, { id: 71 }, { cliente: 7 }, { estado: 'pendiente' },
      { cantidad: 3, extra: true }]) {
      const before = snapshot()
      const response = await call(`${base}/81`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
      assert.equal(response.status, 400)
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`${tipo}: POST, PUT y DELETE conservan la restricción de pedidos pendientes`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    for (const estado of ['confirmado', 'cancelado', 'enviado', 'entregado']) {
      orders[0].estado = estado
      for (const method of ['POST', 'PUT', 'DELETE']) {
        const before = snapshot()
        const response = await call(method === 'POST' ? base : `${base}/81`, { method,
          cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
        assert.equal(response.status, 409)
        assert.deepEqual(response.body, { message: 'Only pending orders can be modified' })
        assertSafe(response)
        assertNoWrites(before)
      }
    }
  })
}

for (const method of ['POST', 'PUT', 'DELETE']) {
  test(`Cliente: ${method} rechaza pedidos ajenos con 404, sin escrituras ni consulta de productos`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    for (const id of [71, 999]) {
      const before = snapshot()
      const response = await call(method === 'POST' ? base : `${base}/${id}`, { method,
        cookie: cookie.pair, token, sourceOrigin: origin,
        body: method === 'POST' ? newDetail({ pedido: id === 71 ? 7 : 999 }) : writeBody(method) })
      assert.equal(response.status, 404)
      assert.deepEqual(response.body, { message: method === 'POST' ? 'Pedido not found' : 'Detalle de pedido not found' })
      assertSafe(response)
      assertNoWrites(before)
      assert.equal(queries.slice(before.queries).some(query => query.Entity === entities.Producto), false)
    }
  })
}

test('El ID del detalle no se confunde con el ID del cliente autenticado', async t => {
  details.find(detail => detail.id === 71).id = 7
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await call(`${base}/7`, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 404)
    assertNoWrites(before)
  }
})

test('POST conserva validaciones numéricas, existencia, producto activo y stock acumulado', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [status, body] of [[400, null], [400, []], [400, {}], [400, newDetail({ pedido: '8' })],
    [400, newDetail({ producto: { id: 1 } })], [400, newDetail({ cantidad: 0 })],
    [400, newDetail({ cantidad: 1.5 })], [400, newDetail({ cantidad: '1' })],
    [404, newDetail({ producto: 999 })], [409, newDetail({ cantidad: 19 })]]) {
    const before = snapshot()
    const response = await call(base, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, status)
    assertSafe(response)
    assertNoWrites(before)
  }
  products[0].estado = false
  const before = snapshot()
  const response = await call(base, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: newDetail() })
  assert.equal(response.status, 409)
  assertNoWrites(before)
})

test('PUT conserva cantidad obligatoria y stock acumulado con otros detalles del mismo producto', async t => {
  const duplicate = Object.assign(new entities.DetallePedido(), { id: 83, pedido: orders[0], producto: products[0],
    cantidad: 18, precioUnitario: 10 })
  details.push(duplicate)
  duplicate.pedido.detallePedido.add(duplicate)
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [status, body] of [[400, {}], [400, null], [400, { cantidad: null }], [400, { cantidad: '3' }],
    [400, { cantidad: -1 }], [400, { cantidad: 1.1 }], [409, { cantidad: 3 }]]) {
    const before = snapshot()
    const response = await call(`${base}/81`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, status)
    assertSafe(response)
    assertNoWrites(before)
  }
})

for (const [method, path] of writeOperations) {
  test(`${method}: CSRF ausente, manipulado o de otra sesión no llega al CRUD`, async t => {
    const { call, bootstrap, authenticate } = await harness(t)
    const current = await authenticate()
    const other = await bootstrap()
    const altered = (current.token[0] === 'a' ? 'b' : 'a') + current.token.slice(1)
    for (const token of [undefined, altered, current.anonymous.token, other.token]) {
      const before = snapshot()
      const response = await call(path, { method, cookie: current.cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`${method}: comprueba origen y admite Referer únicamente cuando falta Origin`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate('admin')
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example']) {
      const before = snapshot()
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin,
        referer: sourceOrigin ? `${origin}/pedidos` : undefined, body: writeBody(method) })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
    const response = await call(path, { method, cookie: cookie.pair, token, referer: `${origin}/pedidos`, body: writeBody(method) })
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assertSafe(response)
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: vencimiento absoluto rechaza todas las operaciones sin escrituras`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start })
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    t.mock.timers.setTime(start + 20 * 60 * 1000)
    await call('/api/probe', { cookie: cookie.pair })
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
    const before = snapshot()
    for (const [method, path] of operations) {
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 401)
      assertSafe(response)
      assertUntouched(before)
    }
  })
}

test('Una identidad dañada o el logout no permiten acceder a detalles', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal((await call(base, { cookie: cookie.pair })).status, 401)
  const second = await authenticate()
  const current = await getStored(store, second.cookie.sid)
  current.identity = { id: 7, tipo: 'intruso' }
  await new Promise((resolve, reject) => store.set(second.cookie.sid, current, error => error ? reject(error) : resolve()))
  const afterLogin = snapshot()
  assert.equal((await call(base, { cookie: second.cookie.pair })).status, 401)
  assertNoWrites(before)
  assertUntouched(afterLogin)
})

for (const method of ['PUT', 'DELETE']) {
  test(`${method}: un detalle eliminado antes de la relectura no provoca cambios`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const original = em.findOne
    t.mock.method(em, 'findOne', async (Entity, criteria, options) => {
      if (Entity === entities.DetallePedido && options?.refresh) details = details.filter(detail => detail.id !== 81)
      return original(Entity, criteria, options)
    })
    const response = await call(`${base}/81`, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 404)
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 0, flushed: 0 })
    assert.equal(orders[0].total, 32.5)
  })

  test(`${method}: vuelve a comprobar titularidad después de bloquear el pedido`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const original = em.findOne
    const detailLookups = []
    t.mock.method(em, 'findOne', async (Entity, criteria, options) => {
      if (Entity === entities.DetallePedido) detailLookups.push({ criteria, options })
      // Simula que otra operación cambia la relación antes de adquirir el bloqueo del pedido.
      if (Entity === entities.Pedido && options?.lockMode) {
        const detail = details.find(detail => detail.id === 81)
        detail.pedido = orders[1]
      }
      return original(Entity, criteria, options)
    })
    const response = await call(`${base}/81`, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 404)
    assert.equal(detailLookups.length, 2)
    assert.equal(detailLookups[1].options.refresh, true)
    assert.equal(details.find(detail => detail.id === 81).cantidad, 2)
    assert.equal(orders[0].total, 32.5)
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 0, flushed: 0 })
    assertSafe(response)
  })

  test(`${method}: el estado leído bajo bloqueo prevalece sobre el estado inicial`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const original = em.findOne
    t.mock.method(em, 'findOne', async (Entity, criteria, options) => {
      if (Entity === entities.Pedido && options?.lockMode) orders[0].estado = 'confirmado'
      return original(Entity, criteria, options)
    })
    const response = await call(`${base}/81`, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 409)
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 0, flushed: 0 })
    assert.equal(orders[0].total, 32.5)
    assert.equal(details.find(detail => detail.id === 81).cantidad, 2)
  })
}

test('Cambio del titular antes del bloqueo del pedido rechaza POST, PUT y DELETE', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const original = em.findOne
  t.mock.method(em, 'findOne', async (Entity, criteria, options) => {
    if (Entity === entities.Pedido && options?.lockMode) orders[0].cliente = records[1]
    return original(Entity, criteria, options)
  })
  for (const method of ['POST', 'PUT', 'DELETE']) {
    orders[0].cliente = records[0]
    const response = await call(method === 'POST' ? base : `${base}/81`, { method,
      cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 404)
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 0, flushed: 0 })
    assert.equal(orders[0].total, 32.5)
  }
})

test('Un total inválido revierte creación, cantidad o eliminación sin flush anticipado', async t => {
  shippingMethods[0].costo = 100_000_000
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const before = storageState()
    const response = await call(method === 'POST' ? base : `${base}/81`, { method,
      cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 409)
    assert.deepEqual(storageState(), before)
    assert.equal(writes.flushed, 0)
    assert.deepEqual(pendingCreates, [])
    assert.deepEqual(pendingRemoves, [])
    assertSafe(response)
  }
})

test('Errores internos de sesiones o del ORM devuelven 500 genérico sin escrituras', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const before = snapshot()
  const brokenStore = t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud de detalles de pedido' })
    assertSafe(response)
    assertUntouched(before)
  }
  brokenStore.mock.restore()
  t.mock.method(em, 'find', () => { throw new TypeError(internalDetail) })
  t.mock.method(em, 'findOne', () => { throw new TypeError(internalDetail) })
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 500)
    assertSafe(response)
    assertNoWrites(before)
  }
})

test('Si falla flush, la transacción simulada revierte la operación y la respuesta oculta el error', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.method(em, 'flush', () => { throw new Error(internalDetail) })
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const before = storageState()
    const response = await call(method === 'POST' ? base : `${base}/81`, { method,
      cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 500)
    assert.deepEqual(storageState(), before)
    assert.equal(writes.flushed, 0)
    assertSafe(response)
  }
})

test('Errores de JSON, tamaño, codificación e ID conservan respuestas seguras', async t => {
  const { call, authenticate } = await harness(t)
  for (const [expected, options] of [[400, { rawBody: `{"password":"${password}",` }],
    [413, { body: { value: 'a'.repeat(110000) } }],
    [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }]]) {
    const before = snapshot()
    const response = await call(base, { method: 'POST', ...options })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertUntouched(before)
  }
  const { cookie } = await authenticate()
  const before = snapshot()
  assert.equal((await call(`${base}/invalido`, { cookie: cookie.pair })).status, 400)
  assertUntouched(before)
})

test('Los servicios rechazan identidades ausentes o inválidas antes del ORM', async () => {
  const before = snapshot()
  for (const identity of [undefined, { id: 0, tipo: 'cliente' }, { id: 7, tipo: 'intruso' }]) {
    await assert.rejects(findAllDetallesPedido(identity), error => error.statusCode === 401)
    await assert.rejects(findDetallePedido(81, identity), error => error.statusCode === 401)
  }
  assertUntouched(before)
})

test('MikroORM genera el filtro relacional en SQL sin ejecutar consultas', () => {
  const sqlEm = metadataOrm.em.fork()
  const query = sqlEm.createQueryBuilder(entities.DetallePedido)
    .select('*').where({ pedido: { cliente: 7 } })
  assert.match(query.getQuery(), /join `pedido`/i)
  assert.match(query.getQuery(), /`cliente_id` = \?/)
  assert.deepEqual(query.getParams(), [7])
})

test('La metadata real confirma que crear un detalle encola una escritura antes del recálculo', () => {
  const sqlEm = metadataOrm.em.fork()
  assert.equal(metadataOrm.config.get('flushMode'), FlushMode.AUTO)
  sqlEm.create(entities.DetallePedido, { pedido: sqlEm.getReference(entities.Pedido, 8),
    producto: sqlEm.getReference(entities.Producto, 1), cantidad: 1, precioUnitario: 10 })
  assert.equal(sqlEm.getUnitOfWork().shouldAutoFlush(metadataOrm.getMetadata().get(entities.DetallePedido)), true)
})

test('El montaje conserva otros prefijos y no añade nuevos métodos al CRUD', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await call('/api/probe', { method })).status, 200)
  }
  const { cookie } = await authenticate('admin')
  assert.equal((await call(`${base}/81`, { method: 'PATCH', cookie: cookie.pair })).status, 404)
})

