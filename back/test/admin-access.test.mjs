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

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/admin-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-admin-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de administradores 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-admin-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const blockedMessage = 'La eliminación de administradores está temporalmente bloqueada'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createAdminRouter, adminAccessErrorHandler, createAuthRouter, authErrorHandler
let createSessionMiddleware, SESSION_TTL_MS

function matches(record, Entity, criteria) {
  return record instanceof Entity && Object.entries(criteria).every(([key, value]) => record[key] === value)
}
// Solo este doble almacena las cuentas; metadataOrm se usa exclusivamente para la serialización real.
const em = {
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
}
for (const method of ['remove', 'persist', 'transactional']) {
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
    'src/admin/admin.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ createAdminRouter, adminAccessErrorHandler } = await load('admin/admin.routes.js'))
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
    dbName: 'minigo_admin_access_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_admin_access_tests',
    debug: false, metadataCache: { enabled: false }, extensions: [],
  })
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  process.env.SESSION_SECRET = testSecret
  process.env.NODE_ENV = 'test'
  // Un Cliente y un Admin comparten ID para comprobar que el tipo también se respeta.
  records = [
    Object.assign(new entities.Admin(), { ...newAdmin(), id: 7, dni: 30111222, mail: 'admin@example.test' }),
    Object.assign(new entities.Admin(), { ...newAdmin(), id: 8, dni: 30111223, mail: 'otro-admin@example.test' }),
    Object.assign(new entities.Cliente(), { ...newAdmin(), id: 7, dni: 30111222, mail: 'cliente@example.test',
      direccion: 'Dirección ficticia 123', telefono: '3410000000' }),
  ]
  for (const record of records) record.password = storedHash
  writes = { created: 0, assigned: 0, flushed: 0 }
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

function newAdmin(overrides = {}) {
  return { nombre: 'Admin ficticio', apellido: 'Prueba', dni: 40111222,
    mail: 'nuevo-admin@example.test', password, ...overrides }
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
  app.use('/api/admins', createAdminRouter({ allowedOrigins: [origin] }), adminAccessErrorHandler)
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
  const authenticate = async (tipo = 'admin', credentials = {}) => {
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

const operations = [
  ['GET', '/api/admins'], ['GET', '/api/admins/7'], ['POST', '/api/admins'],
  ['PUT', '/api/admins/7'], ['DELETE', '/api/admins/7'],
]
for (const actor of ['sin sesión', 'sesión anónima', 'cliente']) {
  for (const [method, path] of operations) {
    test(`${actor}: ${method} ${path} rechaza el acceso antes de consultar o escribir cuentas`, async t => {
      const { call, bootstrap, authenticate } = await harness(t)
      const current = actor === 'sin sesión' ? undefined
        : actor === 'sesión anónima' ? await bootstrap() : await authenticate('cliente')
      const before = snapshot()
      const response = await call(path, { method, cookie: current?.cookie.pair,
        token: current?.token, sourceOrigin: origin,
        body: method === 'POST' ? newAdmin() : method === 'PUT' ? { nombre: 'Cambio no autorizado' } : undefined })
      assert.equal(response.status, actor === 'cliente' ? 403 : 401)
      assert.deepEqual(response.body, { message: actor === 'cliente' ? 'Acceso no autorizado' : 'No autenticado' })
      assertSafe(response)
      assertUntouched(before)
    })
  }
}

test('Admin puede listar y consultar cualquier administrador sin CSRF, con las respuestas existentes y sin hashes', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const list = await call('/api/admins', { cookie: cookie.pair })
  assert.equal(list.status, 200)
  assert.equal(list.body.message, 'found all admins')
  assert.deepEqual(list.body.data.map(account => account.id), [7, 8])
  assertSafe(list)
  const single = await call('/api/admins/8', { cookie: cookie.pair })
  assert.equal(single.status, 200)
  assert.deepEqual(single.body, { message: 'found admin', data: list.body.data[1] })
  assertSafe(single)
  assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
})

test('Admin consulta una cuenta inexistente y conserva el 404 del servicio', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const response = await call('/api/admins/999', { cookie: cookie.pair })
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { message: 'Admin not found' })
  assertSafe(response)
})

test('POST autorizado crea Admin con Argon2id y conserva 201 y el contrato de respuesta', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const response = await call('/api/admins', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: newAdmin({ mail: ' NUEVO-ADMIN@EXAMPLE.TEST ' }) })
  assert.equal(response.status, 201)
  assert.equal(response.body.message, 'admin created')
  assert.equal(response.body.data.mail, 'nuevo-admin@example.test')
  assertSafe(response)
  const created = records.find(record => record.id === response.body.data.id)
  assert.ok(created instanceof entities.Admin)
  assert.match(created.password, /^\$argon2id\$/)
  assert.equal(await verifyPassword(created.password, password), true)
  assert.deepEqual(writes, { created: 1, assigned: 0, flushed: 1 })
})

test('crear otra cuenta no permite modificarla mediante PUT con la sesión del creador', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const created = await call('/api/admins', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: newAdmin() })
  assert.equal(created.status, 201)
  const before = snapshot()
  const response = await call(`/api/admins/${created.body.data.id}`, { method: 'PUT', cookie: cookie.pair,
    token, sourceOrigin: origin, body: { nombre: 'No permitido' } })
  assert.equal(response.status, 403)
  assertSafe(response)
  assertUntouched(before)
})

test('PUT propio conserva la actualización parcial, el hash omitido y el contrato de respuesta', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const response = await call('/api/admins/7', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin,
    body: { nombre: 'Admin actualizado' } })
  assert.equal(response.status, 200)
  assert.equal(response.body.message, 'admin updated')
  assert.equal(response.body.data.nombre, 'Admin actualizado')
  assert.equal(records[0].password, storedHash)
  assert.equal(records[1].nombre, 'Admin ficticio')
  assertSafe(response)
  assert.deepEqual(writes, { created: 0, assigned: 1, flushed: 1 })
})

test('PUT de contraseña propia guarda Argon2id sin revocar todavía la sesión existente', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const newPassword = '  Otra contraseña ficticia 456!  '
  const response = await call('/api/admins/7', { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin,
    body: { password: newPassword } })
  assert.equal(response.status, 200)
  assertSafe(response)
  assert.equal(JSON.stringify(response.body).includes(newPassword), false)
  assert.notEqual(records[0].password, storedHash)
  assert.equal(await verifyPassword(records[0].password, newPassword), true)
  assert.equal(await verifyPassword(records[0].password, password), false)
  assert.equal((await call('/api/admins', { cookie: cookie.pair })).status, 200, 'Revocación pendiente de otro incremento')
})

test('PUT ajeno rechaza también un ID propio enviado en body o query y no alcanza el servicio', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const before = snapshot()
  const response = await call('/api/admins/8?id=7&tipo=admin', { method: 'PUT', cookie: cookie.pair, token,
    sourceOrigin: origin, body: { id: 7, nombre: 'No permitido' } })
  assert.equal(response.status, 403)
  assertSafe(response)
  assertUntouched(before)
})

test('POST y PUT propios conservan las validaciones y los errores 400 sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [method, path, body] of [
    ['POST', '/api/admins', newAdmin({ mail: 'inválido' })],
    ['PUT', '/api/admins/7', { password: '' }], ['PUT', '/api/admins/7', { id: 7 }],
    ['PUT', '/api/admins/7', { nombre: 'Cambio parcial no permitido', mail: 'inválido' }],
  ]) {
    const beforeRecords = records.map(record => ({ ...record }))
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 400)
    assertSafe(response)
    assert.deepEqual(records.map(record => ({ ...record })), beforeRecords)
    assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
  }
})

test('POST y PUT propios conservan el 409 por mail o DNI duplicados sin escrituras', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const [method, path, body] of [
    ['POST', '/api/admins', newAdmin({ mail: 'admin@example.test' })],
    ['POST', '/api/admins', newAdmin({ dni: 30111222 })],
    ['PUT', '/api/admins/7', { mail: 'otro-admin@example.test' }], ['PUT', '/api/admins/7', { dni: 30111223 }],
  ]) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 409)
    assertSafe(response)
    assert.deepEqual(writes, { created: 0, assigned: 0, flushed: 0 })
  }
})

for (const [method, path] of [['POST', '/api/admins'], ['PUT', '/api/admins/7']]) {
  test(`${method}: rechaza CSRF ausente, manipulado, anterior al login o de otra sesión sin escrituras`, async t => {
    const { call, authenticate } = await harness(t)
    const first = await authenticate()
    const second = await authenticate('admin', { mail: 'otro-admin@example.test' })
    const changed = (first.token[0] === 'a' ? 'b' : 'a') + first.token.slice(1)
    for (const token of [undefined, changed, first.anonymous.token, second.token]) {
      const before = snapshot()
      const response = await call(path, { method, cookie: first.cookie.pair, token, sourceOrigin: origin,
        body: method === 'POST' ? newAdmin() : { nombre: 'No permitido' } })
      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
      assertSafe(response)
      assertUntouched(before)
    }
  })

  test(`${method}: exige un origen permitido y solo usa Referer si falta Origin`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example']) {
      const before = snapshot()
      const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin,
        referer: sourceOrigin ? `${origin}/admin` : undefined,
        body: method === 'POST' ? newAdmin() : { nombre: 'No permitido' } })
      assert.equal(response.status, 403)
      assertSafe(response)
      assertUntouched(before)
    }
    const allowed = await call(path, { method, cookie: cookie.pair, token, referer: `${origin}/admin`,
      body: method === 'POST' ? newAdmin() : { nombre: 'Admin actualizado' } })
    assert.equal(allowed.status, method === 'POST' ? 201 : 200)
    assertSafe(allowed)
  })
}

test('DELETE queda bloqueado incluso para el titular con CSRF válido y no invoca deleteAdmin', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const id of [7, 8, 999]) {
    const before = snapshot()
    const response = await call(`/api/admins/${id}`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 403)
    assert.deepEqual(response.body, { message: blockedMessage })
    assertSafe(response)
    assertUntouched(before)
  }
})

test('sesión vencida devuelve 401 en todo el CRUD aunque MemoryStore mantenga vivo el registro', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await call('/api/probe', { cookie: cookie.pair })
  t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
  assert.equal((await call('/api/admins', { cookie: cookie.pair })).status, 200)
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
  const before = snapshot()
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin, body: newAdmin() })
    assert.equal(response.status, 401)
    assertSafe(response)
    assertUntouched(before)
  }
  assert.equal(await getStored(store, cookie.sid), undefined)
})

test('logout elimina el acceso administrativo y la cookie anónima anterior al login tampoco autoriza', async t => {
  const { call, authenticate } = await harness(t)
  const { anonymous, cookie, token } = await authenticate()
  const before = snapshot()
  assert.equal((await call('/api/admins', { cookie: anonymous.cookie.pair })).status, 401)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
  assert.equal((await call('/api/admins', { cookie: cookie.pair })).status, 401)
  assertUntouched(before)
})

test('errores al cargar la sesión antes del router se devuelven como 500 genérico sin acceder a cuentas', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  for (const [method, path] of operations) {
    const response = await call(path, { method, cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 500)
    assert.deepEqual(response.body, { message: 'No se pudo comprobar el acceso administrativo' })
    assertSafe(response)
    assertUntouched(before)
  }
})

test('si falla destruir una sesión vencida no concede permisos ni expone el error del almacén', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await call('/api/probe', { cookie: cookie.pair })
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  t.mock.method(store, 'destroy', (_sid, callback) => callback(new Error(internalDetail)))
  const before = snapshot()
  const response = await call('/api/admins', { cookie: cookie.pair })
  assert.equal(response.status, 500)
  assertSafe(response)
  assertUntouched(before)
})

test('JSON inválido, demasiado grande o con charset no admitido conserva 400, 413 y 415 sin escrituras', async t => {
  const { call } = await harness(t)
  for (const [expected, options] of [
    [400, { rawBody: `{"password":"${password}",` }],
    [413, { body: { value: 'a'.repeat(110000) } }],
    [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }],
  ]) {
    const before = snapshot()
    const response = await call('/api/admins', { method: 'POST', ...options })
    assert.equal(response.status, expected)
    assertSafe(response)
    assertUntouched(before)
  }
})

test('sin administradores válidos no existe creación pública ni bootstrap automático', async t => {
  records = records.filter(record => !(record instanceof entities.Admin))
  const { call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const before = snapshot()
  const response = await call('/api/admins', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: newAdmin() })
  assert.equal(response.status, 401)
  assertSafe(response)
  assertUntouched(before)
  assert.equal(records.some(record => record instanceof entities.Admin), false)
})

test('no se añaden métodos nuevos y los consumidores públicos de otros prefijos conservan su acceso', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await call('/api/probe', { method })).status, 200)
  }
  const { cookie } = await authenticate()
  assert.equal((await call('/api/admins/7', { method: 'PATCH', cookie: cookie.pair })).status, 404)
})
