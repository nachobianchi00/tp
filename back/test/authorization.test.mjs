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
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword } from '../src/shared/security/password.ts'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/authorization.test.mjs
// Middleware y sesiones reales, cuentas simuladas y MemoryStore. Nunca se importa index.ts.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-authorization-tests/', import.meta.url)
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-autorizacion-1234567890'
const password = '  Contraseña ficticia de autorización 123!  '
const origin = 'https://minigo.example'
const internalDetail = 'detalle-privado-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, requireAuthentication, requireAccountType, requireAccountOwner
let createAuthRouter, authErrorHandler, createSessionMiddleware, SESSION_TTL_MS, entities, storedHash
let accounts, lookups

const em = {
  async count(Entity, criteria) {
    return accounts.filter(account => account instanceof Entity && account.id === criteria.id).length
  },
  async findOne(entity, criteria) {
    lookups.push({ entity, criteria })
    return accounts.find(account => account instanceof entity && account.mail === criteria.mail) ?? null
  },
}
for (const method of ['create', 'assign', 'persist', 'remove', 'flush', 'transactional']) {
  const guard = mock.fn(() => { throw new Error('Estas pruebas no permiten escrituras de cuentas') })
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
  const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  const options = [
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
  ]
  execFileSync(process.execPath, [compiler, ...options, '--noEmitOnError', '--rootDir', 'src',
    '--outDir', fileURLToPath(compiledDir), 'src/shared/security/authorization.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  execFileSync(process.execPath, [compiler, ...options, '--noEmit', 'test/authorization-types.test.ts'], {
    cwd: backendDir, stdio: 'pipe', encoding: 'utf8',
  })
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema() { throw new Error('No se permiten cambios de esquema') } },
  })
  ;({ requireAuthentication, requireAccountType, requireAccountOwner } = await import(
    new URL('shared/security/authorization.js', compiledDir).href))
  ;({ createAuthRouter } = await import(new URL('auth/auth.routes.js', compiledDir).href))
  ;({ authErrorHandler } = await import(new URL('auth/auth.controler.js', compiledDir).href))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await import(new URL('shared/security/session.js', compiledDir).href))
  const { Cliente } = await import(new URL('cliente/cliente.entity.js', compiledDir).href)
  const { Admin } = await import(new URL('admin/admin.entity.js', compiledDir).href)
  entities = { cliente: Cliente, admin: Admin }
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  process.env.SESSION_SECRET = testSecret
  process.env.NODE_ENV = 'test'
  // El mismo ID en dos tablas comprueba que la titularidad también exige el tipo.
  accounts = ['cliente', 'admin'].map(tipo => Object.assign(new entities[tipo](), {
    id: 7, mail: 'autorizacion@example.test', password: storedHash,
  }))
  lookups = []
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin MySQL ni escrituras de cuentas')
  } finally {
    ormMock?.restore()
    for (const guard of guards) guard.mock?.restore?.()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

function fakeRequest({ tipo = 'cliente', id = 7, authenticatedAt = Date.now(), params = { id: '7' },
  anonymous = false, failDestroy = false, synchronousFailure = false } = {}) {
  let destroyed = 0
  const request = { params, body: {}, query: {} }
  request.session = {
    ...(anonymous ? {} : { identity: { id, tipo }, authenticatedAt }),
    destroy(callback) {
      destroyed++
      delete request.session
      if (failDestroy) {
        if (synchronousFailure) throw new Error(internalDetail)
        return callback(new Error(internalDetail))
      }
      callback()
    },
  }
  return { request, get destroyed() { return destroyed } }
}

async function invoke(middleware, request, locals = {}) {
  const calls = []
  const response = { locals }
  await middleware(request, response, error => calls.push(error))
  assert.equal(calls.length, 1, 'Se continúa una sola vez, con éxito o error')
  assert.equal(lookups.length, 0, 'La autorización reutiliza la sesión, sin consultar credenciales')
  return { error: calls[0], locals: response.locals }
}

function assertDenied(result, status, message) {
  assert.equal(result.error?.statusCode, status)
  assert.equal(result.error.message, message)
  assert.equal(result.locals.identity, undefined)
  assert.equal(result.error.message.includes(internalDetail), false)
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: sesión válida entrega únicamente id y tipo en res.locals`, async () => {
    const { request } = fakeRequest({ tipo })
    request.session.identity.password = password
    const result = await invoke(requireAuthentication, request)
    assert.equal(result.error, undefined)
    assert.deepEqual(result.locals.identity, { id: 7, tipo })
    assert.notEqual(result.locals.identity, request.session.identity)
    result.locals.identity.id = 99
    assert.equal(request.session.identity.id, 7)
  })

  test(`${tipo}: el middleware de tipo funciona sin requireAuthentication previo`, async () => {
    const result = await invoke(requireAccountType(tipo), fakeRequest({ tipo }).request)
    assert.equal(result.error, undefined)
    assert.deepEqual(result.locals.identity, { id: 7, tipo })
  })

  test(`${tipo}: rechaza el tipo opuesto con 403`, async () => {
    const opposite = tipo === 'cliente' ? 'admin' : 'cliente'
    assertDenied(await invoke(requireAccountType(opposite), fakeRequest({ tipo }).request), 403, 'Acceso no autorizado')
  })

  test(`${tipo}: una lista explícita puede permitir ambos tipos`, async () => {
    assert.equal((await invoke(requireAccountType('cliente', 'admin'), fakeRequest({ tipo }).request)).error, undefined)
  })

  test(`${tipo}: permite acceder a su propia cuenta`, async () => {
    const result = await invoke(requireAccountOwner(tipo), fakeRequest({ tipo }).request)
    assert.equal(result.error, undefined)
    assert.deepEqual(result.locals.identity, { id: 7, tipo })
  })

  test(`${tipo}: rechaza el ID de otra cuenta del mismo tipo`, async () => {
    assertDenied(await invoke(requireAccountOwner(tipo), fakeRequest({ tipo, params: { id: '8' } }).request),
      403, 'Acceso no autorizado')
  })

  test(`${tipo}: compartir ID con el otro tipo de cuenta no concede titularidad`, async () => {
    const opposite = tipo === 'cliente' ? 'admin' : 'cliente'
    assertDenied(await invoke(requireAccountOwner(opposite), fakeRequest({ tipo }).request), 403, 'Acceso no autorizado')
  })
}

for (const kind of ['ausente', 'anónima', 'identidad enviada por el solicitante']) {
  test(`sesión ${kind}: responde 401 y descarta una identidad previa en locals`, async () => {
    const { request } = fakeRequest({ anonymous: true })
    if (kind !== 'anónima') delete request.session
    request.body = { identity: { id: 7, tipo: 'admin' } }
    request.query = { id: '7', tipo: 'admin' }
    for (const middleware of [requireAuthentication, requireAccountType('admin'), requireAccountOwner('cliente')]) {
      assertDenied(await invoke(middleware, request, { identity: { id: 7, tipo: 'admin' } }), 401, 'No autenticado')
    }
  })
}

for (const kind of ['autenticación', 'tipo', 'titularidad']) {
  test(`${kind}: permite antes de 30 minutos y destruye la sesión al alcanzar el límite absoluto`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start + SESSION_TTL_MS - 1 })
    const middleware = kind === 'autenticación' ? requireAuthentication
      : kind === 'tipo' ? requireAccountType('cliente') : requireAccountOwner('cliente')
    const current = fakeRequest({ authenticatedAt: start })
    assert.equal((await invoke(middleware, current.request)).error, undefined)
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assertDenied(await invoke(middleware, current.request), 401, 'No autenticado')
    assert.equal(current.destroyed, 1)
    assert.equal(current.request.session, undefined)
  })
}

test('titularidad valida el ID completo y rechaza parámetros ausentes, ambiguos o inseguros', async () => {
  for (const id of [undefined, '', '0', '-7', '7otro', '7.0', '7e0', ' 7 ', ['7'], '9007199254740992']) {
    assertDenied(await invoke(requireAccountOwner('cliente'), fakeRequest({ params: { id } }).request),
      400, 'ID de cuenta inválido')
  }
  assert.equal((await invoke(requireAccountOwner('cliente'), fakeRequest({ params: { id: '007' } }).request)).error, undefined)
})

test('titularidad admite otro nombre de parámetro sin usar el ID del body o la query', async () => {
  const { request } = fakeRequest({ params: { accountId: '7', id: '8' } })
  request.body = { accountId: 8 }
  request.query = { accountId: '8' }
  assert.equal((await invoke(requireAccountOwner('cliente', 'accountId'), request)).error, undefined)
})

test('no reutiliza una identidad previamente validada si la sesión venció entre middlewares', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start + SESSION_TTL_MS - 1 })
  const { request } = fakeRequest({ authenticatedAt: start })
  const first = await invoke(requireAuthentication, request)
  assert.equal(first.error, undefined)
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assertDenied(await invoke(requireAccountType('cliente'), request, first.locals), 401, 'No autenticado')
})

for (const synchronousFailure of [false, true]) {
  test(`fallo ${synchronousFailure ? 'síncrono' : 'de callback'} al destruir una sesión vencida impide el acceso`, async () => {
    const { request } = fakeRequest({ authenticatedAt: Date.now() - SESSION_TTL_MS, failDestroy: true, synchronousFailure })
    assertDenied(await invoke(requireAuthentication, request), 500, 'No se pudo cerrar la sesión')
  })
}

test('sesiones con identidad o fecha inconsistente se destruyen y nunca conceden acceso', async () => {
  for (const options of [{ id: 0 }, { tipo: 'superadmin' }, { authenticatedAt: Date.now() + 60000 }]) {
    const current = fakeRequest(options)
    assertDenied(await invoke(requireAuthentication, current.request), 401, 'No autenticado')
    assert.equal(current.destroyed, 1)
  }
})

test('las fábricas rechazan configuraciones vacías o tipos inexistentes', () => {
  assert.throws(() => requireAccountType(), /at least one account type/)
  assert.throws(() => requireAccountType('superadmin'), /valid account type/)
  assert.throws(() => requireAccountOwner('superadmin'), /valid account type/)
  assert.throws(() => requireAccountOwner('cliente', ''), /route parameter name/)
})

const getStored = (store, sid) => new Promise((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : resolve(data)))
function cookieFrom(response) {
  const header = response.headers['set-cookie']?.find(value => value.startsWith('minigo.sid='))
  assert.ok(header, 'Debe emitirse la cookie')
  const pair = header.split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return { pair, sid: value.slice(2, value.lastIndexOf('.')) }
}

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  // Una única instancia para ambos grupos; no se importa ni se ejecuta index.ts.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  // Estas rutas protegidas son fixtures: ningún CRUD del proyecto se modifica.
  app.get('/api/protected/me', requireAuthentication, (_req, res) => res.json({ data: res.locals.identity }))
  app.get('/api/protected/admin', requireAccountType('admin'), (_req, res) => res.json({ data: res.locals.identity }))
  app.get('/api/protected/clientes/:id', requireAccountOwner('cliente'), (_req, res) => res.json({ data: res.locals.identity }))
  app.get('/api/protected/admins/:id', requireAccountOwner('admin'), (_req, res) => res.json({ data: res.locals.identity }))
  app.all('/api/probe', (req, res) => res.json({ ok: true, hasSession: Boolean(req.session) }))
  app.get('/public', (req, res) => res.json({ hasSession: Boolean(req.session) }))
  // Reutilizado solo en el servidor de prueba; no se cambia el manejador de los CRUD.
  app.use(authErrorHandler)
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const call = (path, { method = 'GET', cookie, token, body } = {}) => new Promise((resolve, reject) => {
    const headers = { Origin: origin }
    const payload = body === undefined ? undefined : JSON.stringify(body)
    if (cookie) headers.Cookie = cookie
    if (token) headers['X-CSRF-Token'] = token
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload)
    }
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
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
  const authenticate = async (tipo = 'cliente') => {
    const csrf = await call('/api/auth/csrf')
    assert.equal(csrf.status, 200)
    const anonymous = cookieFrom(csrf)
    const response = await call('/api/auth/login', { method: 'POST', cookie: anonymous.pair, token: csrf.body.csrfToken,
      body: { tipo, mail: 'autorizacion@example.test', password } })
    assert.equal(response.status, 200)
    const cookie = cookieFrom(response)
    assert.notEqual(cookie.sid, anonymous.sid)
    return { cookie, token: response.body.csrfToken }
  }
  return { store, call, authenticate }
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: HTTP login → sesión compartida → titularidad → me → logout`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate(tipo)
    const expected = { data: { id: 7, tipo } }
    const queries = lookups.length
    for (const path of ['/api/protected/me', `/api/protected/${tipo === 'cliente' ? 'clientes' : 'admins'}/7`, '/api/auth/me']) {
      const response = await call(path, { cookie: cookie.pair })
      assert.equal(response.status, 200)
      assert.deepEqual(response.body, expected)
      assert.equal(JSON.stringify(response.body).includes(storedHash), false)
    }
    assert.equal(lookups.length, queries, 'Las consultas autenticadas no vuelven a verificar credenciales')
    const end = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token })
    assert.equal(end.status, 200)
    assert.equal(await getStored(store, cookie.sid), undefined)
    assert.equal((await call('/api/protected/me', { cookie: cookie.pair })).status, 401)
  })
}

test('HTTP sin sesión o con sesión anónima responde 401 en las rutas protegidas', async t => {
  const { call } = await harness(t)
  const anonymous = cookieFrom(await call('/api/auth/csrf'))
  for (const cookie of [undefined, anonymous.pair]) {
    for (const path of ['/api/protected/me', '/api/protected/admin', '/api/protected/clientes/7']) {
      const response = await call(path, { cookie })
      assert.equal(response.status, 401)
      assert.deepEqual(response.body, { message: 'No autenticado' })
    }
  }
})

test('HTTP rechaza roles y cuentas ajenas, incluso con el mismo ID en Cliente y Admin', async t => {
  const { call, authenticate } = await harness(t)
  const client = await authenticate('cliente')
  const admin = await authenticate('admin')
  for (const [cookie, path] of [
    [client.cookie.pair, '/api/protected/admin'], [client.cookie.pair, '/api/protected/clientes/8'],
    [client.cookie.pair, '/api/protected/admins/7'], [admin.cookie.pair, '/api/protected/clientes/7'],
    [admin.cookie.pair, '/api/protected/admins/8'],
  ]) {
    const response = await call(path, { cookie })
    assert.equal(response.status, 403)
    assert.deepEqual(response.body, { message: 'Acceso no autorizado' })
  }
  assert.equal((await call('/api/protected/admin', { cookie: admin.cookie.pair })).status, 200)
})

test('HTTP rechaza una sesión vencida aunque una ruta pública haya mantenido vivo su registro', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  assert.equal((await call('/api/probe', { cookie: cookie.pair })).status, 200)
  t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
  assert.equal((await call('/api/protected/me', { cookie: cookie.pair })).status, 200)
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
  assert.equal((await call('/api/protected/me', { cookie: cookie.pair })).status, 401)
  assert.equal(await getStored(store, cookie.sid), undefined)
})

test('HTTP valida el ID y no concede acceso por un ID parcialmente numérico', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const response = await call('/api/protected/clientes/7otro', { cookie: cookie.pair })
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'ID de cuenta inválido' })
})

test('HTTP ignora identidades enviadas por body o query y no mezcla sesiones distintas', async t => {
  const { call, authenticate } = await harness(t)
  const client = await authenticate('cliente')
  const admin = await authenticate('admin')
  const forged = await call('/api/protected/admin?tipo=admin&id=7', { cookie: client.cookie.pair,
    body: { identity: { id: 7, tipo: 'admin' } } })
  assert.equal(forged.status, 403)
  assert.deepEqual((await call('/api/protected/me', { cookie: client.cookie.pair })).body.data, { id: 7, tipo: 'cliente' })
  assert.deepEqual((await call('/api/protected/me', { cookie: admin.cookie.pair })).body.data, { id: 7, tipo: 'admin' })
})

test('compartir sesiones en /api no exige login o CSRF en rutas públicas ni afecta rutas fuera de /api', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const response = await call('/api/probe', { method })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { ok: true, hasSession: true })
    assert.equal(response.headers['set-cookie'], undefined)
  }
  const { cookie } = await authenticate()
  assert.deepEqual((await call('/public', { cookie: cookie.pair })).body, { hasSession: false })
})
