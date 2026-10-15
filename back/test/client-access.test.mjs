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
import { FlushMode, ForeignKeyConstraintViolationException, IsolationLevel, LockMode } from '@mikro-orm/core'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/client-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-client-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de clientes 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-clientes-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createClienteRouter, clienteAccessErrorHandler, createAuthRouter, authErrorHandler
let createSessionMiddleware, SESSION_TTL_MS
let deleteCliente, orders, transactionEvents, transactionFailure, beforeOrderCount

function matches(record, Entity, criteria) {
  return record instanceof Entity && Object.entries(criteria).every(([key, value]) => record[key] === value)
}
// Solo este doble almacena las cuentas; metadataOrm se usa exclusivamente para la serialización real.
const em = {
  async count(Entity, criteria) {
    return records.filter(record => record instanceof Entity && record.id === criteria.id).length
  },
  async find(Entity, criteria) {
    queries.push({ operation: 'find', Entity, criteria })
    return records.filter(record => matches(record, Entity, criteria))
  },
  async findOne(Entity, criteria) {
    queries.push({ operation: 'findOne', Entity, criteria })
    return records.find(record => matches(record, Entity, criteria)) ?? null
  },
  create(Entity, input) {
    const account = Object.assign(new Entity(), input, { id: Math.max(...records.map(record => record.id), 0) + 1 })
    records.push(account)
    writes.created++
    return account
  },
  assign(account, input) {
    writes.assigned++
    Object.assign(account, input)
  },
  async flush() { writes.flushed++ },
  async transactional(callback, options) {
    assert.deepEqual(options, { clear: true, flushMode: FlushMode.COMMIT, isolationLevel: IsolationLevel.READ_COMMITTED })
    const removed = []
    transactionEvents.push('begin')
    const tx = {
      async findOne(Entity, criteria, findOptions) {
        assert.equal(Entity, entities.Cliente)
        assert.deepEqual(findOptions, {
          lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true, populate: false, flushMode: FlushMode.COMMIT,
        })
        transactionEvents.push('lock')
        if (transactionFailure === 'lock') throw new Error(internalDetail)
        return records.find(record => matches(record, Entity, criteria)) ?? null
      },
      async count(Entity, criteria, countOptions) {
        assert.equal(Entity, entities.Pedido)
        assert.deepEqual(countOptions, { flushMode: FlushMode.COMMIT })
        transactionEvents.push('count')
        beforeOrderCount?.()
        if (transactionFailure === 'count') throw new Error(internalDetail)
        return orders.filter(order => order.cliente.id === criteria.cliente).length
      },
      remove(record) {
        assert.ok(record instanceof entities.Cliente, 'Nunca elimina pedidos')
        transactionEvents.push('remove')
        removed.push(record)
      },
      async flush() {
        transactionEvents.push('flush')
        if (transactionFailure === 'fk') throw new ForeignKeyConstraintViolationException(new Error(internalDetail))
        if (transactionFailure === 'flush') throw new Error(internalDetail)
      },
    }
    try {
      await callback(tx)
      if (transactionFailure === 'commit') throw new Error(internalDetail)
      records = records.filter(record => !removed.includes(record))
      transactionEvents.push('commit')
    } catch (error) {
      transactionEvents.push('rollback')
      throw error
    }
  },
}
for (const method of ['remove', 'persist']) {
  const guard = mock.fn(() => { throw new Error(`Estas pruebas no permiten ${method}`) })
  em[method] = guard
  guards.push(guard)
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
    'src/cliente/cliente.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ createClienteRouter, clienteAccessErrorHandler } = await load('cliente/cliente.routes.js'))
  ;({ createAuthRouter } = await load('auth/auth.routes.js'))
  ;({ authErrorHandler } = await load('auth/auth.controler.js'))
  ;({ deleteCliente } = await load('cliente/cliente.service.js'))
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
    dbName: 'minigo_client_access_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_client_access_tests',
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
  writes = { created: 0, assigned: 0, flushed: 0 }
  queries = []
  orders = []
  transactionEvents = []
  transactionFailure = undefined
  beforeOrderCount = undefined
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
  return { records: records.map(record => ({ ...record })), writes: { ...writes }, queries: queries.length }
}
function assertUntouched(before) {
  assert.deepEqual(records.map(record => ({ ...record })), before.records)
  assert.deepEqual(writes, before.writes)
  assert.equal(queries.length, before.queries, 'Una petición sin permisos no llega a los servicios del CRUD')
}

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  // Mismo montaje que index.ts; solo Express aislado, ningún arranque real.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  app.use('/api/clientes', createClienteRouter({ allowedOrigins: [origin] }), clienteAccessErrorHandler)
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

const privateOperations = [
  ['GET', '/api/clientes'], ['GET', '/api/clientes/7'],
  ['PUT', '/api/clientes/7'], ['DELETE', '/api/clientes/7'],
]
for (const actor of ['sin sesión', 'sesión anónima']) {
  for (const [method, path] of privateOperations) {
    test(`${actor}: ${method} ${path} devuelve 401 antes de acceder al CRUD`, async t => {
      const { call, bootstrap } = await harness(t)
      const current = actor === 'sesión anónima' ? await bootstrap() : undefined
      const before = snapshot()
      const response = await call(path, { method, cookie: current?.cookie.pair, token: current?.token,
        sourceOrigin: origin, body: method === 'PUT' ? { nombre: 'No permitido' } : undefined })
      assert.equal(response.status, 401)
      assert.deepEqual(response.body, { message: 'No autenticado' })
      assertSafe(response)
      assertUntouched(before)
    })
  }
}

test('registro público con sesión anónima y CSRF crea Cliente, oculta el hash y no inicia sesión', async t => {
  const { call, bootstrap, store } = await harness(t)
  const { cookie, token } = await bootstrap()
  const response = await call('/api/clientes', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: newCliente({ mail: ' NUEVO-CLIENTE@EXAMPLE.TEST ' }) })
  assert.equal(response.status, 201)
  assert.equal(response.body.message, 'cliente created')
  assert.equal(response.body.data.mail, 'nuevo-cliente@example.test')
  assertSafe(response)
  const created = records.find(record => record instanceof entities.Cliente && record.id === response.body.data.id)
  assert.match(created.password, /^\$argon2id\$/)
  assert.equal(await verifyPassword(created.password, password), true)
  assert.deepEqual(writes, { created: 1, assigned: 0, flushed: 1 })
  assert.equal((await getStored(store, cookie.sid)).identity, undefined)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 401)
  assert.equal((await call(`/api/clientes/${created.id}`, { cookie: cookie.pair })).status, 401)
  // La cuenta recién creada sí puede autenticarse usando los endpoints ya existentes.
  const login = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token,
    sourceOrigin: origin, body: { tipo: 'cliente', mail: created.mail, password } })
  assert.equal(login.status, 200)
  assert.deepEqual(login.body.data, { id: created.id, tipo: 'cliente' })
  assert.equal((await call(`/api/clientes/${created.id}`, { cookie: cookieFrom(login).pair })).status, 200)
})

for (const tipo of ['cliente', 'admin']) {
  test(`registro público también funciona con sesión ${tipo} sin cambiar su identidad`, async t => {
    const { call, authenticate, store } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const response = await call('/api/clientes', { method: 'POST', cookie: cookie.pair, token,
      sourceOrigin: origin, body: newCliente() })
    assert.equal(response.status, 201)
    assertSafe(response)
    assert.deepEqual((await getStored(store, cookie.sid)).identity, { id: 7, tipo })
    assert.ok(records.at(-1) instanceof entities.Cliente)
  })
}

test('POST sin cookie ni token devuelve 403 y nunca llama al servicio de registro', async t => {
  const { call } = await harness(t)
  const before = snapshot()
  const response = await call('/api/clientes', { method: 'POST', sourceOrigin: origin, body: newCliente() })
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
  assertSafe(response)
  assertUntouched(before)
})

test('Cliente no puede listar cuentas ni elevar su tipo mediante query o body', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  const response = await call('/api/clientes?tipo=admin&id=7', { cookie: cookie.pair,
    body: { tipo: 'admin', identity: { id: 7, tipo: 'admin' } } })
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
  assertSafe(response)
  assertUntouched(before)
})

test('Admin lista y consulta cualquier Cliente sin CSRF, conservando respuestas y ocultando hashes', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const list = await call('/api/clientes', { cookie: cookie.pair })
  assert.equal(list.status, 200)
  assert.equal(list.body.message, 'found all clientes')
  assert.deepEqual(list.body.data.map(account => account.id), [7, 8])
  assertSafe(list)
  for (const id of [7, 8]) {
    const single = await call(`/api/clientes/${id}`, { cookie: cookie.pair })
    assert.equal(single.status, 200)
    assert.deepEqual(single.body, { message: 'found cliente', data: list.body.data.find(account => account.id === id) })
    assertSafe(single)
  }
  assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
})

test('Cliente titular consulta sus datos sin token CSRF y conserva las relaciones y la respuesta', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const response = await call('/api/clientes/7', { cookie: cookie.pair })
  assert.equal(response.status, 200)
  assert.equal(response.body.message, 'found cliente')
  assert.equal(response.body.data.id, 7)
  assert.equal(response.body.data.mail, 'cliente@example.test')
  assert.deepEqual(response.body.data.pedidos, [])
  assertSafe(response)
  assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
})

for (const method of ['GET', 'PUT']) {
  test(`Cliente: ${method} ajeno no se autoriza con ID o tipo falsificados ni llega al servicio`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const before = snapshot()
    const response = await call('/api/clientes/8?id=7&tipo=admin', { method, cookie: cookie.pair, token,
      sourceOrigin: origin, body: { id: 7, tipo: 'admin', nombre: 'No permitido' } })
    assert.equal(response.status, 403)
    assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
    assertSafe(response)
    assertUntouched(before)
  })
}

test('Cliente no puede consultar una cuenta ajena inexistente: 403 sin revelar su existencia', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  const response = await call('/api/clientes/999', { cookie: cookie.pair })
  assert.equal(response.status, 403)
  assertSafe(response)
  assertUntouched(before)
})

test('Admin conserva el 404 del servicio al consultar un Cliente inexistente', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const response = await call('/api/clientes/999', { cookie: cookie.pair })
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { message: 'Cliente not found' })
  assertSafe(response)
})

for (const id of [7, 8]) {
  test(`Admin no puede actualizar Cliente ${id}, aunque comparta su ID y tenga CSRF válido`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate('admin')
    for (const body of [{ nombre: 'No permitido' }, { password: 'Otra contraseña ficticia!' }]) {
      const before = snapshot()
      const response = await call(`/api/clientes/${id}`, { method: 'PUT', cookie: cookie.pair,
        token, sourceOrigin: origin, body })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
  })
}

test('PUT del titular conserva las actualizaciones parciales y el hash cuando se omite password', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const response = await call('/api/clientes/7', { method: 'PUT', cookie: cookie.pair, token,
    sourceOrigin: origin, body: { nombre: 'Cliente actualizado', direccion: 'Otra dirección 456' } })
  assert.equal(response.status, 200)
  assert.equal(response.body.message, 'cliente updated')
  assert.equal(response.body.data.nombre, 'Cliente actualizado')
  assert.equal(response.body.data.direccion, 'Otra dirección 456')
  assert.equal(response.body.data.telefono, '3410000000')
  assert.equal(records[0].password, storedHash)
  assert.equal(records[1].nombre, 'Cliente ficticio')
  assertSafe(response)
  assert.deepEqual(writes, { created: 0, assigned: 1, flushed: 1 })
})

test('PUT de contraseña propia guarda Argon2id y las sesiones anteriores siguen válidas: revocación pendiente', async t => {
  const { call, authenticate } = await harness(t)
  const first = await authenticate()
  const previousSession = await authenticate()
  const newPassword = '  Otra contraseña ficticia 456!  '
  const response = await call('/api/clientes/7', { method: 'PUT', cookie: first.cookie.pair, token: first.token,
    sourceOrigin: origin, body: { password: newPassword } })
  assert.equal(response.status, 200)
  assertSafe(response)
  assert.equal(JSON.stringify(response.body).includes(newPassword), false)
  assert.notEqual(records[0].password, storedHash)
  assert.equal(await verifyPassword(records[0].password, newPassword), true)
  assert.equal(await verifyPassword(records[0].password, password), false)
  for (const current of [first, previousSession]) {
    assert.equal((await call('/api/clientes/7', { cookie: current.cookie.pair })).status, 200)
  }
})

test('POST y PUT conservan validaciones y errores 400 sin escrituras parciales', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [method, path, body] of [
    ['POST', '/api/clientes', newCliente({ mail: 'inválido' })],
    ['POST', '/api/clientes', newCliente({ password: '   ' })],
    ['PUT', '/api/clientes/7', { password: '' }], ['PUT', '/api/clientes/7', { id: 7 }],
    ['PUT', '/api/clientes/7', { pedidos: [] }],
    ['PUT', '/api/clientes/7', { nombre: 'Cambio parcial no permitido', mail: 'inválido' }],
  ]) {
    const beforeRecords = records.map(record => ({ ...record }))
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 400)
    assertSafe(response)
    assert.deepEqual(records.map(record => ({ ...record })), beforeRecords)
    assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
  }
})

test('POST y PUT conservan el 409 por mail o DNI duplicados sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [method, path, body] of [
    ['POST', '/api/clientes', newCliente({ mail: 'cliente@example.test' })],
    ['POST', '/api/clientes', newCliente({ dni: 30111222 })],
    ['PUT', '/api/clientes/7', { mail: 'otro-cliente@example.test' }], ['PUT', '/api/clientes/7', { dni: 30111223 }],
  ]) {
    const beforeRecords = records.map(record => ({ ...record }))
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 409)
    assertSafe(response)
    assert.deepEqual(records.map(record => ({ ...record })), beforeRecords)
    assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
  }
})

test('la titularidad rechaza IDs ambiguos antes del CRUD y acepta un ID propio con ceros iniciales', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const method of ['GET', 'PUT']) {
    for (const id of ['7otro', '0', '-7', '9007199254740992']) {
      const before = snapshot()
      const response = await call(`/api/clientes/${id}`, { method, cookie: cookie.pair, token,
        sourceOrigin: origin, body: method === 'PUT' ? { nombre: 'No permitido' } : undefined })
      assert.equal(response.status, 400)
      assertSafe(response)
      assertUntouched(before)
    }
  }
  assert.equal((await call('/api/clientes/007', { cookie: cookie.pair })).status, 200)
})

for (const [method, path] of [['POST', '/api/clientes'], ['PUT', '/api/clientes/7']]) {
  test(`${method}: CSRF ausente, manipulado, anterior al login o de otra sesión no llega al CRUD`, async t => {
    const { call, bootstrap, authenticate } = await harness(t)
    const first = method === 'POST' ? await bootstrap() : await authenticate()
    const second = await bootstrap()
    const changed = (first.token[0] === 'a' ? 'b' : 'a') + first.token.slice(1)
    const invalidTokens = [undefined, changed, second.token]
    if (first.anonymous) invalidTokens.push(first.anonymous.token)
    for (const token of invalidTokens) {
      const before = snapshot()
      const response = await call(path, { method, cookie: first.cookie.pair, token, sourceOrigin: origin,
        body: method === 'POST' ? newCliente() : { nombre: 'No permitido' } })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`${method}: exige origen permitido y admite Referer únicamente si falta Origin`, async t => {
    const { call, bootstrap, authenticate } = await harness(t)
    const { cookie, token } = method === 'POST' ? await bootstrap() : await authenticate()
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example']) {
      const before = snapshot()
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin,
        referer: sourceOrigin ? `${origin}/cuenta` : undefined,
        body: method === 'POST' ? newCliente() : { nombre: 'No permitido' } })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
    const allowed = await call(path, { method, cookie: cookie.pair, token, referer: `${origin}/cuenta`,
      body: method === 'POST' ? newCliente() : { nombre: 'Cliente actualizado' } })
    assert.equal(allowed.status, method === 'POST' ? 201 : 200)
    assertSafe(allowed)
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`DELETE rechaza cuentas ajenas o rol incorrecto para ${tipo} sin invocar el servicio`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    for (const id of (tipo === 'cliente' ? [8, 999] : [7, 8, 999])) {
      const before = snapshot()
      const response = await call(`/api/clientes/${id}`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
      assertSafe(response)
      assertUntouched(before)
    }
  })
}

test('DELETE rechaza CSRF inválido incluso para el titular y no llama al servicio', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const before = snapshot()
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, sourceOrigin: origin })
  assert.equal(response.status, 403)
  assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
  assertSafe(response)
  assertUntouched(before)
})

test('token anónimo vencido no permite registro aunque MemoryStore mantenga la sesión', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await call('/api/probe', { cookie: cookie.pair })
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
  const before = snapshot()
  const response = await call('/api/clientes', { method: 'POST', cookie: cookie.pair, token,
    sourceOrigin: origin, body: newCliente() })
  assert.equal(response.status, 403)
  assertSafe(response)
  assertUntouched(before)
  const renewed = await call('/api/auth/csrf', { cookie: cookie.pair })
  assert.equal(renewed.status, 200)
  assert.notEqual(renewed.body.csrfToken, token)
  assert.equal((await call('/api/clientes', { method: 'POST', cookie: cookie.pair, token: renewed.body.csrfToken,
    sourceOrigin: origin, body: newCliente() })).status, 201)
})

for (const tipo of ['cliente', 'admin']) {
  test(`sesión ${tipo} vencida devuelve 401 en rutas privadas aunque el almacén la mantenga`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start })
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    t.mock.timers.setTime(start + 20 * 60 * 1000)
    await call('/api/probe', { cookie: cookie.pair })
    t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
    assert.equal((await call('/api/clientes/7', { cookie: cookie.pair })).status, 200)
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
    const before = snapshot()
    for (const [method, path] of privateOperations) {
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin,
        body: method === 'PUT' ? { nombre: 'No permitido' } : undefined })
      assert.equal(response.status, 401)
      assertSafe(response)
      assertUntouched(before)
    }
    assert.equal(await getStored(store, cookie.sid), undefined)
  })
}

test('logout y la cookie anónima anterior al login no permiten consultar la cuenta', async t => {
  const { call, authenticate } = await harness(t)
  const { anonymous, cookie, token } = await authenticate()
  const before = snapshot()
  assert.equal((await call('/api/clientes/7', { cookie: anonymous.cookie.pair })).status, 401)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal((await call('/api/clientes/7', { cookie: cookie.pair })).status, 401)
  assertUntouched(before)
})

test('errores al cargar la sesión se devuelven como 500 genérico sin llegar al CRUD', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  for (const [method, path] of [...privateOperations, ['POST', '/api/clientes']]) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo comprobar el acceso a clientes' })
    assertSafe(response)
    assertUntouched(before)
  }
})

test('si falla destruir la sesión vencida, se rechaza el acceso y no se expone el error interno', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await call('/api/probe', { cookie: cookie.pair })
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  t.mock.method(store, 'destroy', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  const response = await call('/api/clientes/7', { cookie: cookie.pair })
  assert.equal(response.status, 500)
  assertSafe(response)
  assertUntouched(before)
})

test('JSON inválido, excesivo o charset no admitido devuelve 400, 413 y 415 sin llegar al CRUD', async t => {
  const { call } = await harness(t)
  for (const [expected, options] of [
    [400, { rawBody: `{"password":"${password}",` }],
    [413, { body: { value: 'a'.repeat(110000) } }],
    [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }],
  ]) {
    const before = snapshot()
    const response = await call('/api/clientes', { method: 'POST', ...options })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertUntouched(before)
  }
})

test('no se agregan métodos nuevos y otros prefijos mantienen su acceso público', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await call('/api/probe', { method })).status, 200)
  }
  const { cookie } = await authenticate()
  assert.equal((await call('/api/clientes/7', { method: 'PATCH', cookie: cookie.pair })).status, 404)
})

test('baja propia sin pedidos: confirma la transacción, destruye sesión y borra cookie', async t => {
  const { call, authenticate, store } = await harness(t)
  const { cookie, token } = await authenticate()
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { message: 'cliente deleted' })
  assertSafe(response)
  assert.equal(records.some(record => record instanceof entities.Cliente && record.id === 7), false)
  assert.ok(records.some(record => record instanceof entities.Cliente && record.id === 8))
  assert.deepEqual(transactionEvents, ['begin', 'lock', 'count', 'remove', 'flush', 'commit'])
  assert.equal(await getStored(store, cookie.sid), undefined)
  const cleared = response.headers['set-cookie'].find(header => header.startsWith('minigo.sid='))
  assert.match(cleared, /Path=\/api/)
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/)
  assert.match(cleared, /HttpOnly/)
  assert.match(cleared, /SameSite=Lax/)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 401)
})

for (const estado of ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado']) {
  test(`pedido ${estado}: rechaza la baja con 409 sin modificar cuenta, pedido ni sesión`, async t => {
    const { call, authenticate, store } = await harness(t)
    const { cookie, token } = await authenticate()
    const cliente = records.find(record => record instanceof entities.Cliente && record.id === 7)
    orders.push({ id: 1, cliente, estado })
    const before = snapshot()
    const stored = await getStored(store, cookie.sid)
    const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 409)
    assert.match(response.body.message, /pedidos registrados/)
    assertSafe(response)
    assertUntouched(before)
    assert.deepEqual(transactionEvents, ['begin', 'lock', 'count', 'rollback'])
    assert.deepEqual(orders, [{ id: 1, cliente, estado }])
    assert.deepEqual((await getStored(store, cookie.sid)).identity, stored.identity)
    assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
    assert.equal(response.headers['set-cookie'], undefined)
  })
}

test('pedidos de otro cliente no impiden eliminar la cuenta propia', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const other = records.find(record => record instanceof entities.Cliente && record.id === 8)
  orders.push({ id: 1, cliente: other, estado: 'pendiente' })
  assert.equal((await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal(orders[0].cliente, other)
})

test('baja invalida otras sesiones del Cliente, nuevo login falla y Admin con igual ID sigue válido', async t => {
  const { call, authenticate, store, bootstrap } = await harness(t)
  const first = await authenticate()
  const second = await authenticate()
  const admin = await authenticate('admin')
  assert.equal((await call('/api/clientes/7', { method: 'DELETE', cookie: first.cookie.pair,
    token: first.token, sourceOrigin: origin })).status, 200)
  assert.equal((await call('/api/clientes/7', { cookie: second.cookie.pair })).status, 401)
  assert.equal(await getStored(store, second.cookie.sid), undefined)
  assert.equal((await call('/api/auth/me', { cookie: second.cookie.pair })).status, 401)
  assert.equal((await call('/api/auth/me', { cookie: admin.cookie.pair })).status, 200)
  const anonymous = await bootstrap()
  const login = await call('/api/auth/login', { method: 'POST', cookie: anonymous.cookie.pair,
    token: anonymous.token, sourceOrigin: origin, body: { tipo: 'cliente', mail: 'cliente@example.test', password } })
  assert.equal(login.status, 401)
  assert.deepEqual(login.body, { message: 'Credenciales inválidas' })
})

test('CSRF manipulado no llega a la transacción de borrado', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const invalid = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token: invalid, sourceOrigin: origin })
  assert.equal(response.status, 403)
  assertUntouched(before)
  assert.deepEqual(transactionEvents, [])
})

for (const failure of ['lock', 'count', 'flush', 'commit']) {
  test(`fallo de BD en ${failure}: 500 genérico, rollback y sesión conservada`, async t => {
    const { call, authenticate, store } = await harness(t)
    const { cookie, token } = await authenticate()
    const before = snapshot()
    transactionFailure = failure
    const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud' })
    assertSafe(response)
    assertUntouched(before)
    assert.equal(transactionEvents.at(-1), 'rollback')
    assert.ok((await getStored(store, cookie.sid)).identity)
    assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
  })
}

test('violación referencial simulada devuelve 409 y conserva la cuenta y sesión', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  transactionFailure = 'fk'
  const before = snapshot()
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 409)
  assertSafe(response)
  assertUntouched(before)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
})

test('servicio devuelve 404 si la cuenta ya no existe al tomar el bloqueo', async () => {
  const before = snapshot()
  await assert.rejects(deleteCliente(999), error => error.statusCode === 404)
  assertUntouched(before)
  assert.deepEqual(transactionEvents, ['begin', 'lock', 'rollback'])
})

test('vuelve a contar dentro de la transacción y rechaza un pedido aparecido antes de la consulta', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  beforeOrderCount = () => orders.push({ id: 1, cliente: { id: 7 } })
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 409)
  assert.deepEqual(transactionEvents, ['begin', 'lock', 'count', 'rollback'])
  assert.ok(records.some(record => record instanceof entities.Cliente && record.id === 7))
})

test('fallo del almacén tras el borrado no informa éxito; borra cookie y ninguna sesión concede acceso', async t => {
  const { call, authenticate, store } = await harness(t)
  const first = await authenticate()
  const second = await authenticate()
  const destroyMock = t.mock.method(store, 'destroy', (_sid, callback) => callback(new Error(internalDetail)))
  const response = await call('/api/clientes/7', { method: 'DELETE', cookie: first.cookie.pair,
    token: first.token, sourceOrigin: origin })
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.ok(response.headers['set-cookie'].some(header => /Expires=Thu, 01 Jan 1970/.test(header)))
  assert.equal(records.some(record => record instanceof entities.Cliente && record.id === 7), false)
  assert.equal((await call('/api/clientes/7', { cookie: second.cookie.pair })).status, 500)
  destroyMock.mock.restore()
  assert.equal((await call('/api/clientes/7', { cookie: second.cookie.pair })).status, 401)
})

test('fallo al comprobar existencia rechaza acceso sin usar la identidad antigua', async t => {
  const { call, authenticate, store } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const countMock = t.mock.method(em, 'count', async () => { throw new Error(internalDetail) })
  for (const path of ['/api/auth/me', '/api/clientes/7']) {
    const response = await call(path, { cookie: cookie.pair })
    assert.equal(response.status, 500)
    assertSafe(response)
  }
  assert.equal((await call('/api/clientes/7', { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })).status, 500)
  assertUntouched(before)
  assert.deepEqual(transactionEvents, [])
  assert.ok((await getStored(store, cookie.sid)).identity)
  countMock.mock.restore()
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
})

test('metadata: Cliente no elimina pedidos por cascada; Pedido.cliente es obligatorio', () => {
  const clientRelation = metadataOrm.getMetadata().get('Cliente').properties.pedidos
  const orderRelation = metadataOrm.getMetadata().get('Pedido').properties.cliente
  assert.equal(clientRelation.cascade.includes('remove'), false)
  assert.notEqual(clientRelation.orphanRemoval, true)
  assert.notEqual(orderRelation.nullable, true)
  assert.notEqual(orderRelation.deleteRule, 'cascade')
  assert.notEqual(orderRelation.deleteRule, 'set null')
})

test('GET individual de Cliente comprueba la cuenta una sola vez y conserva 200, 400 y 403', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const consultas = t.mock.method(em, 'count')
  for (const [id, status] of [['7', 200], ['8', 403], ['999', 403], ['7otro', 400], ['0', 400]]) {
    consultas.mock.resetCalls()
    const response = await call(`/api/clientes/${id}`, { cookie: cookie.pair })
    assert.equal(response.status, status)
    assertSafe(response)
    assert.equal(consultas.mock.callCount(), 1)
    assert.deepEqual(consultas.mock.calls[0].arguments, [entities.Cliente, { id: 7 }])
  }
  assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
})

test('GET individual de Admin comprueba la cuenta una sola vez y conserva acceso y 404', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate('admin')
  const consultas = t.mock.method(em, 'count')
  for (const [id, status] of [['7', 200], ['8', 200], ['999', 404]]) {
    consultas.mock.resetCalls()
    const response = await call(`/api/clientes/${id}`, { cookie: cookie.pair })
    assert.equal(response.status, status)
    assertSafe(response)
    assert.equal(consultas.mock.callCount(), 1)
    assert.deepEqual(consultas.mock.calls[0].arguments, [entities.Admin, { id: 7 }])
  }
  assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
})

