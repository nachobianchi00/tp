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
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword, verifyPassword } from '../src/shared/security/password.ts'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/payment-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-payment-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de clientes 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-clientes-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createPagoRouter, pagoErrorHandler, findAllPagos, findPagoForAccount, createAuthRouter, authErrorHandler
let createSessionMiddleware, SESSION_TTL_MS, orders, payments, transactionCalls

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
  if (Entity === entities.Pago) return payments
  if (Entity === entities.Pedido) return orders
  return records
}
// El doble filtra por la condicion recibida antes de devolver entidades. Nunca usa MySQL.
const em = {
  async find(Entity, criteria, options) {
    queries.push({ operation: 'find', Entity, criteria, options })
    return storedEntities(Entity).filter(record => matches(record, Entity, criteria))
  },
  async findOne(Entity, criteria, options) {
    queries.push({ operation: 'findOne', Entity, criteria, options })
    return storedEntities(Entity).find(record => matches(record, Entity, criteria)) ?? null
  },
  create(Entity, input) {
    assert.equal(Entity, entities.Pago, 'Solo se crean pagos simulados')
    const payment = Object.assign(new Entity(), input, { id: Math.max(...payments.map(record => record.id), 0) + 1 })
    payments.push(payment)
    writes.created++
    return payment
  },
  assign(payment, input) { writes.assigned++; Object.assign(payment, input) },
  remove(payment) {
    assert.ok(payment instanceof entities.Pago, 'Solo se eliminan pagos simulados')
    payments.splice(payments.indexOf(payment), 1)
    writes.removed++
  },
  async flush() { writes.flushed++ },
  async transactional(callback) {
    transactionCalls++
    const previous = payments.slice()
    const values = previous.map(payment => ({ ...payment }))
    try { return await callback(em) }
    catch (error) {
      payments = previous
      previous.forEach((payment, index) => {
        // No reasignar relaciones intactas: MikroORM sincroniza sus dos extremos mediante setters.
        for (const key of Object.keys(payment)) {
          if (!Object.hasOwn(values[index], key)) delete payment[key]
        }
        for (const [key, value] of Object.entries(values[index])) {
          if (payment[key] !== value) payment[key] = value
        }
      })
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
    'src/pedido/pago.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ createPagoRouter } = await load('pedido/pago.routes.js'))
  ;({ pagoErrorHandler } = await load('pedido/pago.controler.js'))
  ;({ findAllPagos, findPagoForAccount } = await load('pedido/pago.service.js'))
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
    dbName: 'minigo_payment_access_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_payment_access_tests',
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
  const method = Object.assign(new entities.MetodoPago(), { id: 1, descripcion: 'Prueba', estado: true })
  const shipping = Object.assign(new entities.MetodoEnvio(), { id: 1, descripcion: 'Prueba', costo: 0, estado: true })
  orders = [[31, 0, 125.5], [32, 1, 240], [33, 0, 49.99], [34, 1, 60], [35, 0, 75]].map(([id, owner, total]) =>
    Object.assign(new entities.Pedido(), { id, cliente: records[owner], total, estado: 'pendiente',
      fechaCreacion: new Date('2026-10-10T12:00:00Z'), metodoPago: method, metodoEnvio: shipping }))
  // El pago 7 pertenece al cliente 8. Tener el mismo ID de cuenta y pago no implica titularidad.
  payments = [[8, 0], [7, 1], [9, 2]].map(([id, order]) => Object.assign(new entities.Pago(), {
    id, pedido: orders[order], preferenceId: 'preference-test-' + id, externalReference: 'reference-test-' + id,
    estado: 'pending', monto: orders[order].total, fechaCreacion: new Date('2026-10-10T12:00:00Z'),
  }))
  transactionCalls = 0
  writes = { created: 0, assigned: 0, removed: 0, flushed: 0 }

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

function snapshot() {
  return { records: records.map(record => ({ ...record })), orders: orders.map(order => ({ ...order })),
    payments: payments.map(payment => ({ ...payment })), writes: { ...writes }, queries: queries.length,
    transactionCalls }
}
function assertNoWrites(before) {
  assert.deepEqual(records.map(record => ({ ...record })), before.records)
  assert.deepEqual(orders.map(order => ({ ...order })), before.orders)
  assert.deepEqual(payments.map(payment => ({ ...payment })), before.payments)
  assert.deepEqual(writes, before.writes)
}
function assertUntouched(before) {
  assertNoWrites(before)
  assert.equal(queries.length, before.queries, 'Sin permisos o CSRF no se consultan pagos ni pedidos')
  assert.equal(transactionCalls, before.transactionCalls)
}

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  // Mismo montaje que index.ts; solo Express aislado, ningún arranque real.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  app.use('/api/pagos', createPagoRouter({ allowedOrigins: [origin] }), pagoErrorHandler)
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

function newPayment(overrides = {}) {
  return { pedido: 34, preferenceId: 'preference-ficticia', externalReference: 'referencia-ficticia', ...overrides }
}
const operations = [
  ['GET', '/api/pagos'], ['GET', '/api/pagos/8'], ['POST', '/api/pagos'],
  ['PUT', '/api/pagos/8'], ['DELETE', '/api/pagos/8'],
]
const writeOperations = operations.filter(([method]) => ['POST', 'PUT', 'DELETE'].includes(method))
const writeBody = method => method === 'POST' ? newPayment() : method === 'PUT' ? { estado: 'approved' } : undefined

for (const actor of ['sin sesión', 'sesión anónima']) {
  for (const [method, path] of operations) {
    test(`${actor}: ${method} ${path} devuelve 401 sin consultar ni escribir pagos`, async t => {
      const { call, bootstrap } = await harness(t)
      const current = actor === 'sesión anónima' ? await bootstrap() : undefined
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

for (const [method, path] of writeOperations) {
  test(`Cliente: ${method} no llega al CRUD aunque el pago sea propio y tenga CSRF válido`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    for (const target of method === 'POST' ? [path] : [path, '/api/pagos/7']) {
      const before = snapshot()
      const response = await call(`${target}?tipo=admin`, { method, cookie: cookie.pair, token, sourceOrigin: origin,
        body: method === 'DELETE' ? undefined : { ...writeBody(method), tipo: 'admin', identity: { id: 7, tipo: 'admin' } } })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
      assertSafe(response)
      assertUntouched(before)
    }
  })
}

test('Admin lista y consulta todos los pagos sin CSRF, conservando los contratos y las relaciones', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const before = snapshot()
  const list = await call('/api/pagos', { cookie: cookie.pair })
  assert.equal(list.status, 200)
  assert.equal(list.body.message, 'found all pagos')
  assert.deepEqual(list.body.data.map(payment => payment.id), [8, 7, 9])
  assertSafe(list)
  assert.deepEqual(queries.at(-1).criteria, {})
  assert.deepEqual(queries.at(-1).options, { populate: ['pedido'] })
  for (const id of [8, 7, 9]) {
    const single = await call(`/api/pagos/${id}`, { cookie: cookie.pair })
    assert.equal(single.status, 200)
    assert.deepEqual(single.body, { message: 'found pago', data: list.body.data.find(payment => payment.id === id) })
    assertSafe(single)
    assert.deepEqual(queries.at(-1).criteria, { id })
  }
  assertNoWrites(before)
})

for (const [mail, id, ownPaymentIds] of [
  ['cliente@example.test', 7, [8, 9]], ['otro-cliente@example.test', 8, [7]],
]) {
  test(`Cliente ${id}: el ORM filtra el listado por Pedido.cliente y permite solo consultas propias`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie } = await authenticate('cliente', { mail })
    const before = snapshot()
    const list = await call('/api/pagos?cliente=999&tipo=admin&pedido=32', { cookie: cookie.pair,
      body: { cliente: 999, identity: { id: 7, tipo: 'admin' } } })
    assert.equal(list.status, 200)
    assert.equal(list.body.message, 'found all pagos')
    assert.deepEqual(list.body.data.map(payment => payment.id), ownPaymentIds)
    assertSafe(list)
    assert.deepEqual(queries.at(-1).criteria, { pedido: { cliente: id } }, 'El filtro llega al ORM, no se aplica después')
    assert.deepEqual(queries.at(-1).options, { populate: ['pedido'] }, 'No se amplían los datos relacionados')
    for (const paymentId of ownPaymentIds) {
      const single = await call(`/api/pagos/${paymentId}`, { cookie: cookie.pair })
      assert.equal(single.status, 200)
      assert.deepEqual(single.body, { message: 'found pago', data: list.body.data.find(payment => payment.id === paymentId) })
      assert.deepEqual(queries.at(-1).criteria, { id: paymentId, pedido: { cliente: id } })
      assertSafe(single)
    }
    assertNoWrites(before)
  })
}

test('Cliente sin pagos propios recibe un listado vacío y nunca se cargan los pagos ajenos', async t => {
  payments = payments.filter(payment => payment.pedido.cliente.id !== 7)
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  const response = await call('/api/pagos', { cookie: cookie.pair })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { message: 'found all pagos', data: [] })
  assert.deepEqual(queries.at(-1).criteria, { pedido: { cliente: 7 } })
  assertSafe(response)
  assertNoWrites(before)
})

test('pago ajeno con ID igual al cliente e ID falsificado en body o query devuelve el mismo 404 que uno inexistente', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  for (const id of [7, 999]) {
    const response = await call(`/api/pagos/${id}?cliente=8&pedido=31&tipo=admin`, { cookie: cookie.pair,
      body: { pedido: 31, cliente: 7, identity: { tipo: 'admin', id: 7 } } })
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { message: 'Pago not found' })
    assertSafe(response)
    assert.deepEqual(queries.at(-1).criteria, { id, pedido: { cliente: 7 } })
    assertNoWrites(before)
  }
  assert.equal(queries.length - before.queries, 2, 'Solo hay una consulta acotada por solicitud')
})

test('la titularidad se obtiene del pedido asociado almacenado, incluso si cambia entre consultas', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  assert.equal((await call('/api/pagos/8', { cookie: cookie.pair })).status, 200)
  // Cambio exclusivo del almacenamiento simulado; demuestra que no se confía en el ID de Pago ni en caché local.
  orders[0].cliente = records[1]
  const before = snapshot()
  const response = await call('/api/pagos/8', { cookie: cookie.pair })
  assert.equal(response.status, 404)
  assertSafe(response)
  assertNoWrites(before)
})

test('MikroORM instalado genera un JOIN y un WHERE por cliente para los filtros reales, sin ejecutar SQL', async () => {
  const before = snapshot()
  await findAllPagos({ id: 7, tipo: 'cliente' })
  await findPagoForAccount(8, { id: 7, tipo: 'cliente' })
  for (const query of queries.slice(before.queries)) {
    const qb = metadataOrm.em.fork().createQueryBuilder(entities.Pago).select('*').where(query.criteria)
    const sql = qb.getQuery()
    assert.match(sql, /join `pedido`/i)
    assert.match(sql, /where .*`cliente_id` = \?/i)
    assert.deepEqual(qb.getParams(), query.operation === 'find' ? [7] : [8, 7])
  }
  assertNoWrites(before)
})

test('las lecturas por cuenta rechazan identidades ausentes o inválidas antes de consultar el ORM', async () => {
  for (const identity of [undefined, null, {}, { id: 7, tipo: 'otro' }, { id: 0, tipo: 'cliente' }]) {
    const before = snapshot()
    for (const operation of [() => findAllPagos(identity), () => findPagoForAccount(8, identity)]) {
      await assert.rejects(operation, error => error.statusCode === 401 && error.message === 'No autenticado')
      assertUntouched(before)
    }
  }
})

test('Admin consulta un pago inexistente y conserva el 404 del servicio', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const response = await call('/api/pagos/999', { cookie: cookie.pair })
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { message: 'Pago not found' })
  assertSafe(response)
})

test('POST Admin con CSRF crea pago pendiente, calcula monto desde el pedido y conserva 201', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const response = await call('/api/pagos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: newPayment({ estado: 'approved', monto: 60 }) })
  assert.equal(response.status, 201)
  assert.equal(response.body.message, 'pago created')
  assert.equal(response.body.data.estado, 'pending', 'El servicio conserva su estado inicial obligatorio')
  assert.equal(response.body.data.monto, 60)
  assertSafe(response)
  const created = payments.find(payment => payment.id === response.body.data.id)
  assert.equal(created.pedido, orders[3])
  assert.equal(created.preferenceId, 'preference-ficticia')
  assert.equal(transactionCalls, 1)
  assert.deepEqual(writes, { created: 1, assigned: 0, removed: 0, flushed: 1 })
})

test('PUT Admin con CSRF conserva cambios de estado y detalle, monto, pedido y contrato de respuesta', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const originalPedido = payments[0].pedido
  const response = await call('/api/pagos/8', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin,
    body: { estado: 'approved', statusDetail: 'accredited' } })
  assert.equal(response.status, 200)
  assert.equal(response.body.message, 'pago updated')
  assert.equal(response.body.data.estado, 'approved')
  assert.equal(response.body.data.statusDetail, 'accredited')
  assert.equal(response.body.data.monto, 125.5)
  assert.equal(payments[0].pedido, originalPedido)
  assert.equal(payments[1].estado, 'pending')
  assertSafe(response)
  assert.deepEqual(writes, { created: 0, assigned: 1, removed: 0, flushed: 1 })
})

test('DELETE Admin con CSRF conserva la eliminación existente, sin agregar nuevas reglas de estado', async t => {
  payments[0].estado = 'approved'
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  const response = await call('/api/pagos/8', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { message: 'pago deleted' })
  assertSafe(response)
  assert.deepEqual(payments.map(payment => payment.id), [7, 9])
  assert.equal(orders.length, 5, 'No se eliminan pedidos ni clientes')
  assert.equal(records.length, 3)
  assert.deepEqual(writes, { created: 0, assigned: 0, removed: 1, flushed: 1 })
})

test('POST Admin mantiene validaciones 400 y conflictos 409 sin crear ni modificar pagos', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const [expected, body] of [
    [400, null], [400, newPayment({ pedido: '34' })], [400, newPayment({ preferenceId: '' })],
    [400, newPayment({ externalReference: '' })], [400, newPayment({ monto: -1 })],
    [404, newPayment({ pedido: 999 })], [409, newPayment({ pedido: 31 })], [409, newPayment({ monto: 999 })],
  ]) {
    const before = snapshot()
    const response = await call('/api/pagos', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertNoWrites(before)
  }
})

test('PUT Admin conserva estados válidos y rechazo de cambios de identidad o monto sin escrituras parciales', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const body of [[], { estado: 'no-valido' }, { monto: 100 }, { pedido: 32 },
    { preferenceId: 'otro' }, { externalReference: 'otra' }, { statusDetail: 'No debe cambiar', estado: 'incorrecto' }]) {
    const before = snapshot()
    const response = await call('/api/pagos/8', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 400)
    assertSafe(response)
    assertNoWrites(before)
  }
  for (const estado of ['pending', 'approved', 'rejected', 'in_process', 'cancelled']) {
    const response = await call('/api/pagos/8', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body: { estado } })
    assert.equal(response.status, 200)
    assert.equal(response.body.data.estado, estado)
    assertSafe(response)
  }
})

test('PUT y DELETE Admin conservan 404 para pagos inexistentes sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const method of ['PUT', 'DELETE']) {
    const before = snapshot()
    const response = await call('/api/pagos/999', { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 404)
    assert.deepEqual(response.body, { message: 'Pago not found' })
    assertSafe(response)
    assertNoWrites(before)
  }
})

for (const [method, path] of writeOperations) {
  test(`Admin ${method}: CSRF ausente, manipulado, anterior al login o de otra sesión no llega al servicio`, async t => {
    const { call, bootstrap, authenticate } = await harness(t)
    const first = await authenticate('admin')
    const second = await bootstrap()
    const changed = (first.token[0] === 'a' ? 'b' : 'a') + first.token.slice(1)
    for (const token of [undefined, changed, first.anonymous.token, second.token]) {
      const before = snapshot()
      const response = await call(path, { method, cookie: first.cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`Admin ${method}: exige origen permitido y usa Referer solo cuando falta Origin`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate('admin')
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example']) {
      const before = snapshot()
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin,
        referer: sourceOrigin ? `${origin}/pagos` : undefined, body: writeBody(method) })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
    const response = await call(path, { method, cookie: cookie.pair, token, referer: `${origin}/pagos`, body: writeBody(method) })
    assert.equal(response.status, method === 'POST' ? 201 : 200)
    assertSafe(response)
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`sesión ${tipo} vencida impide todo acceso aunque MemoryStore mantenga el registro`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start })
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    t.mock.timers.setTime(start + 20 * 60 * 1000)
    await call('/api/probe', { cookie: cookie.pair })
    t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
    assert.equal((await call('/api/pagos/8', { cookie: cookie.pair })).status, 200)
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
    const before = snapshot()
    for (const [method, path] of operations) {
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 401)
      assertSafe(response)
      assertUntouched(before)
    }
    assert.equal(await getStored(store, cookie.sid), undefined)
  })
}

test('logout y la cookie anónima previa al login no permiten consultar pagos', async t => {
  const { call, authenticate } = await harness(t)
  const { anonymous, cookie, token } = await authenticate()
  const before = snapshot()
  assert.equal((await call('/api/pagos', { cookie: anonymous.cookie.pair })).status, 401)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal((await call('/api/pagos', { cookie: cookie.pair })).status, 401)
  assertUntouched(before)
})

test('errores al cargar una sesión antes del router salen como 500 genérico sin llegar al CRUD', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud de pagos' })
    assertSafe(response)
    assertUntouched(before)
  }
})

test('errores internos del almacenamiento no exponen SQL, mensajes de excepción ni hashes', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate('admin')
  for (const Exception of [Error, TypeError, RangeError]) {
    const restore = [
      t.mock.method(em, 'find', () => { throw new Exception(internalDetail) }),
      t.mock.method(em, 'findOne', () => { throw new Exception(internalDetail) }),
    ]
    const before = snapshot()
    for (const [method, path] of operations) {
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: writeBody(method) })
      assert.equal(response.status, 500)
      assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud de pagos' })
      assertSafe(response)
      assertNoWrites(before)
    }
    restore.forEach(fn => fn.mock.restore())
  }
})

test('errores conocidos del parser y del ID mantienen 400, 413 o 415 con respuestas seguras', async t => {
  const { call, authenticate } = await harness(t)
  for (const [expected, options] of [
    [400, { rawBody: `{"password":"${password}",` }],
    [413, { body: { value: 'a'.repeat(110000) } }],
    [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }],
  ]) {
    const before = snapshot()
    const response = await call('/api/pagos', { method: 'POST', ...options })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertUntouched(before)
  }
  const { cookie } = await authenticate('admin')
  const before = snapshot()
  const response = await call('/api/pagos/invalid', { cookie: cookie.pair })
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'Route parameter id must be a safe integer' })
  assertSafe(response)
  assertUntouched(before)
})

test('otros prefijos conservan su acceso y Pago no agrega métodos HTTP nuevos', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await call('/api/probe', { method })).status, 200)
  }
  const { cookie } = await authenticate('admin')
  assert.equal((await call('/api/pagos/8', { method: 'PATCH', cookie: cookie.pair })).status, 404)
})

