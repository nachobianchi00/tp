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

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/auth-http.test.mjs
// Router y servicios reales, cuentas simuladas, Argon2 real y MemoryStore. Nunca se importa index.ts.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-auth-http-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia para HTTP 123!  '
const internalDetail = 'detalle-interno-ficticio-que-no-debe-salir'
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-HTTP-1234567890'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
const moduleMocks = []
let createAuthRouter, authErrorHandler, createSessionMiddleware, SESSION_TTL_MS
let entities, storedHash, accounts, lookups, lookupFailure

const em = {
  async count(Entity, criteria) {
    return accounts.filter(account => account instanceof Entity && account.id === criteria.id).length
  },
  async findOne(entity, criteria) {
    lookups.push({ entity, criteria })
    if (lookupFailure) throw lookupFailure
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
    guards.push(mock.method(target, method, () => { throw new Error('No se permite inicializar el ORM ni acceder a MySQL') }))
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  // Compila el router y sus dependencias en node_modules, ignorado por Git, sin ejecutar el arranque.
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir), 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  moduleMocks.push(mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema() { throw new Error('No se permiten cambios de esquema') } },
  }))
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
  accounts = ['cliente', 'admin'].map((tipo, index) => Object.assign(new entities[tipo](), {
    id: 7 + index, nombre: 'Dato privado ficticio', mail: 'http@example.com', password: storedHash,
  }))
  lookups = []
  lookupFailure = undefined
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'No debe haber acceso a MySQL ni escrituras de cuentas')
  } finally {
    for (const moduleMock of moduleMocks) moduleMock.restore()
    for (const guard of guards) guard.mock?.restore?.()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

const credentials = (tipo = 'cliente', overrides = {}) => ({ tipo, mail: 'http@example.com', password, ...overrides })
const identityFor = tipo => ({ id: tipo === 'cliente' ? 7 : 8, tipo })
const getStored = (store, sid) => new Promise((resolve, reject) => store.get(sid, (error, value) => error ? reject(error) : resolve(value)))

function assertSafe(response) {
  assert.match(response.headers['content-type'], /application\/json/)
  assert.equal(response.headers['cache-control'], 'no-store')
  const serialized = JSON.stringify(response.body, (key, value) => {
    assert.equal(['password', 'hash', 'secret', 'stack', 'sessionID', 'sessionId', 'authenticatedAt'].includes(key), false)
    return value
  })
  // Nombrar el campo en un error de validación es válido; exponer su contenido o propiedad no lo es.
  for (const value of [password, storedHash, testSecret, internalDetail, '$argon2',
    'authenticatedAt', 'sessionId', 'sessionID', 'stack', 'http@example.com', 'Dato privado ficticio']) {
    assert.equal(serialized.includes(value), false, `La respuesta no debe incluir ${value === storedHash ? 'el hash' : 'datos internos'}`)
  }
}

function cookieFrom(response) {
  const header = response.headers['set-cookie']?.find(value => value.startsWith('minigo.sid='))
  assert.ok(header, 'Debe emitirse la cookie de sesión')
  const pair = header.split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return { header, pair, sid: value.slice(2, value.lastIndexOf('.')) }
}

async function harness(t, { trustProxy = false } = {}) {
  const store = new session.MemoryStore()
  const app = express()
  if (trustProxy) app.set('trust proxy', 'loopback')
  app.use(express.json())
  // Mismo montaje que index.ts; se omiten ORM y arranque real.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  // Consumidor de prueba fuera de auth: recibe la sesión, pero sigue sin autenticación ni CSRF.
  app.all('/api/probe', (req, res) => res.json({ ok: true, hasSession: Boolean(req.session) }))
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
    if (payload !== undefined && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json'
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: requestHeaders, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try { resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : undefined }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
  const bootstrap = async (headers) => {
    const response = await call('/api/auth/csrf', { headers })
    assert.equal(response.status, 200)
    assertSafe(response)
    return { response, cookie: cookieFrom(response), token: response.body.csrfToken }
  }
  const authenticate = async (tipo = 'cliente') => {
    const anonymous = await bootstrap()
    const response = await call('/api/auth/login', { method: 'POST', cookie: anonymous.cookie.pair,
      token: anonymous.token, sourceOrigin: origin, body: credentials(tipo) })
    assert.equal(response.status, 200)
    assertSafe(response)
    return { anonymous, response, cookie: cookieFrom(response), token: response.body.csrfToken }
  }
  return { store, call, bootstrap, authenticate }
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: recorrido HTTP completo csrf → login → me → logout`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { anonymous, response, cookie, token } = await authenticate(tipo)
    assert.deepEqual(response.body, { message: 'Sesión iniciada', data: identityFor(tipo), csrfToken: token })
    assert.notEqual(cookie.sid, anonymous.cookie.sid)
    assert.notEqual(token, anonymous.token)
    assert.equal(await getStored(store, anonymous.cookie.sid), undefined)
    const stored = await getStored(store, cookie.sid)
    assert.deepEqual(stored.identity, identityFor(tipo))
    assert.equal(stored.csrf.token, token)
    assert.match(cookie.header, /; HttpOnly(?:;|$)/)
    assert.match(cookie.header, /; SameSite=Lax(?:;|$)/)
    assert.match(cookie.header, /; Path=\/api(?:;|$)/)
    assert.doesNotMatch(cookie.header, /; Secure(?:;|$)/)
    assert.equal(cookie.header.includes(token), false)
    const current = await call('/api/auth/me', { cookie: cookie.pair })
    assert.equal(current.status, 200)
    assert.deepEqual(current.body, { data: identityFor(tipo) })
    assertSafe(current)
    const end = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(end.status, 200)
    assert.deepEqual(end.body, { message: 'Sesión cerrada' })
    assertSafe(end)
    const cleared = cookieFrom(end)
    assert.equal(cleared.pair, 'minigo.sid=')
    assert.match(cleared.header, /; Path=\/api(?:;|$)/)
    assert.ok(Date.parse(cleared.header.match(/; Expires=([^;]+)/)[1]) < Date.now())
    assert.equal(await getStored(store, cookie.sid), undefined)
    const oldCookie = await call('/api/auth/me', { cookie: cookie.pair })
    assert.equal(oldCookie.status, 401)
    assert.deepEqual(oldCookie.body, { message: 'No autenticado' })
    assertSafe(oldCookie)
  })
}

test('GET csrf crea una sesión anónima y reutiliza su token sin exponer la identidad ni la sesión completa', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { response, cookie, token } = await bootstrap()
  assert.deepEqual(Object.keys(response.body), ['csrfToken'])
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.equal((await getStored(store, cookie.sid)).identity, undefined)
  const repeat = await call('/api/auth/csrf', { cookie: cookie.pair })
  assert.equal(repeat.body.csrfToken, token)
  assert.equal(repeat.headers['set-cookie'], undefined)
  assert.equal(lookups.length, 0)
})

test('GET me sin autenticación devuelve 401 y conserva una sesión anónima para un futuro login', async t => {
  const { call, bootstrap } = await harness(t)
  const empty = await call('/api/auth/me')
  assert.equal(empty.status, 401)
  assertSafe(empty)
  const anonymous = await bootstrap()
  const current = await call('/api/auth/me', { cookie: anonymous.cookie.pair })
  assert.equal(current.status, 401)
  assert.equal(current.headers['set-cookie'], undefined)
  const login = await call('/api/auth/login', { method: 'POST', cookie: anonymous.cookie.pair,
    token: anonymous.token, sourceOrigin: origin, body: credentials() })
  assert.equal(login.status, 200)
})

test('las credenciales incorrectas, inexistentes y antiguas en texto plano producen el mismo 401', async t => {
  const { call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const attempts = [credentials('cliente', { password: 'incorrecta ficticia' }),
    credentials('cliente', { mail: 'inexistente@example.com' }), credentials()]
  for (const [index, body] of attempts.entries()) {
    if (index === 2) accounts[0].password = password
    const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 401)
    assert.deepEqual(response.body, { message: 'Credenciales inválidas' })
    assert.equal(response.headers['set-cookie'], undefined)
    assertSafe(response)
  }
})

test('valida tipo, mail y password con 400 sin crear una sesión autenticada', async t => {
  const { call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  for (const body of [null, [], credentials('superadmin'), credentials('cliente', { mail: 'inválido' }),
    credentials('cliente', { password: '' })]) {
    const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 400)
    assertSafe(response)
  }
  assert.equal(lookups.length, 0)
})

test('normaliza el mail, conserva los espacios de password y descarta un ID enviado por el cliente', async t => {
  const { call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: credentials('cliente', { mail: ' HTTP@EXAMPLE.COM ', id: 999, identity: { id: 999, tipo: 'admin' } }) })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.data, identityFor('cliente'))
  assertSafe(response)
})

for (const path of ['/api/auth/login', '/api/auth/logout']) {
  test(`${path}: rechaza tokens ausentes y manipulados antes de verificar credenciales o destruir la sesión`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const originalLookups = lookups.length
    const changed = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    for (const supplied of [undefined, changed]) {
      const response = await call(path, { method: 'POST', cookie: cookie.pair, token: supplied,
        sourceOrigin: origin, body: credentials() })
      assert.equal(response.status, 403)
      assertSafe(response)
    }
    assert.equal(lookups.length, originalLookups)
    assert.deepEqual((await getStored(store, cookie.sid)).identity, identityFor('cliente'))
  })

  test(`${path}: exige un origen permitido y acepta Referer únicamente si falta Origin`, async t => {
    const { call, bootstrap } = await harness(t)
    const { cookie, token } = await bootstrap()
    for (const sourceOrigin of [undefined, 'null', 'https://evil.example', 'https://minigo.example.evil.example']) {
      const response = await call(path, { method: 'POST', cookie: cookie.pair, token,
        sourceOrigin, body: credentials(), referer: sourceOrigin ? `${origin}/login` : undefined })
      assert.equal(response.status, 403)
      assertSafe(response)
    }
    const permitted = await call(path, { method: 'POST', cookie: cookie.pair, token,
      referer: `${origin}/login`, body: credentials() })
    assert.equal(permitted.status, 200)
  })
}

test('el token anterior al login no sirve con la nueva cookie, y el nuevo sí permite logout', async t => {
  const { call, authenticate } = await harness(t)
  const { anonymous, cookie, token } = await authenticate()
  const rejected = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair,
    token: anonymous.token, sourceOrigin: origin })
  assert.equal(rejected.status, 403)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
})

test('una cookie manipulada no recupera la identidad', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  const changed = cookie.pair.slice(0, -1) + (cookie.pair.endsWith('a') ? 'b' : 'a')
  const response = await call('/api/auth/me', { cookie: changed })
  assert.equal(response.status, 401)
  assertSafe(response)
})

test('un nuevo login renueva ID y token, y un intento incorrecto conserva la sesión existente', async t => {
  const { store, call, authenticate } = await harness(t)
  const first = await authenticate('cliente')
  const invalid = await call('/api/auth/login', { method: 'POST', cookie: first.cookie.pair,
    token: first.token, sourceOrigin: origin, body: credentials('admin', { password: 'incorrecta ficticia' }) })
  assert.equal(invalid.status, 401)
  assert.deepEqual((await call('/api/auth/me', { cookie: first.cookie.pair })).body.data, identityFor('cliente'))
  const second = await call('/api/auth/login', { method: 'POST', cookie: first.cookie.pair,
    token: first.token, sourceOrigin: origin, body: credentials('admin') })
  assert.equal(second.status, 200)
  assert.notEqual(cookieFrom(second).sid, first.cookie.sid)
  assert.notEqual(second.body.csrfToken, first.token)
  assert.equal(await getStored(store, first.cookie.sid), undefined)
  assert.deepEqual(second.body.data, identityFor('admin'))
})

test('GET me aplica el vencimiento absoluto de 30 minutos aunque MemoryStore renueve la duración por actividad', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
  t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
  assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
  const rejected = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(rejected.status, 403)
  const expired = await call('/api/auth/me', { cookie: cookie.pair })
  assert.equal(expired.status, 401)
  assertSafe(expired)
  assert.equal(cookieFrom(expired).pair, 'minigo.sid=')
  assert.equal(await getStored(store, cookie.sid), undefined)
  assert.equal((await call('/api/auth/csrf')).status, 200, 'Puede preparar un nuevo login anónimo')
})

test('GET csrf con una sesión autenticada vencida no extiende su fecha de login', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { call, authenticate } = await harness(t)
  const { cookie } = await authenticate()
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await call('/api/auth/me', { cookie: cookie.pair })
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  const response = await call('/api/auth/csrf', { cookie: cookie.pair })
  assert.equal(response.status, 403)
  assertSafe(response)
})

test('logout de una sesión anónima válida elimina su token y su cookie', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const response = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 200)
  assert.equal(await getStored(store, cookie.sid), undefined)
  assert.equal(cookieFrom(response).pair, 'minigo.sid=')
})

test('HTTPS reconocido emite y elimina la cookie con Secure y el mismo Path', async t => {
  const { call, bootstrap } = await harness(t, { trustProxy: true })
  const headers = { 'X-Forwarded-Proto': 'https' }
  const { cookie, token } = await bootstrap(headers)
  assert.match(cookie.header, /; Secure(?:;|$)/)
  const response = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, headers })
  assert.equal(response.status, 200)
  const cleared = cookieFrom(response)
  assert.match(cleared.header, /; Secure(?:;|$)/)
  assert.match(cleared.header, /; Path=\/api(?:;|$)/)
})

test('un fallo al leer credenciales devuelve 500 genérico sin revelar detalles', async t => {
  const { call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  lookupFailure = new Error(internalDetail)
  const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: credentials() })
  assert.equal(response.status, 500)
  assert.deepEqual(response.body, { message: 'No se pudo completar la autenticación' })
  assertSafe(response)
})

test('errores del middleware de sesiones anterior al router también salen como JSON genérico', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { cookie } = await bootstrap()
  t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
  const response = await call('/api/auth/me', { cookie: cookie.pair })
  assert.equal(response.status, 500)
  assertSafe(response)
})

test('errores al regenerar impiden el login y no exponen errores del almacén', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const originalDestroy = store.destroy
  t.mock.method(store, 'destroy', (sid, callback) => sid === cookie.sid
    ? callback(new Error(internalDetail)) : originalDestroy.call(store, sid, callback))
  const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: credentials() })
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.equal(cookieFrom(response).pair, 'minigo.sid=')
  assert.equal((await getStored(store, cookie.sid)).identity, undefined)
})

test('un fallo al guardar la identidad no devuelve éxito ni una cookie autenticada', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const originalSet = store.set
  let newSid
  t.mock.method(store, 'set', (sid, data, callback) => {
    if (data.identity) { newSid = sid; return callback(new Error(internalDetail)) }
    return originalSet.call(store, sid, data, callback)
  })
  const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: credentials() })
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.equal(cookieFrom(response).pair, 'minigo.sid=')
  assert.equal(await getStored(store, newSid), undefined)
})

test('si falla guardar el nuevo token CSRF después del login, revierte la sesión y elimina la cookie', async t => {
  const { store, call, bootstrap } = await harness(t)
  const { cookie, token } = await bootstrap()
  const originalSet = store.set
  let newSid
  t.mock.method(store, 'set', (sid, data, callback) => {
    if (data.identity && data.csrf) { newSid = sid; return callback(new Error(internalDetail)) }
    return originalSet.call(store, sid, data, callback)
  })
  const response = await call('/api/auth/login', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: credentials() })
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.equal(cookieFrom(response).pair, 'minigo.sid=')
  assert.equal(await getStored(store, newSid), undefined)
  assert.equal(await getStored(store, cookie.sid), undefined)
})

test('si falla la destrucción de sesión, logout devuelve error y no informa éxito ni elimina la cookie', async t => {
  const { store, call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  t.mock.method(store, 'destroy', (_sid, callback) => callback(new Error(internalDetail)))
  const response = await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.equal(response.headers['set-cookie'], undefined)
  assert.deepEqual((await getStored(store, cookie.sid)).identity, identityFor('cliente'))
})

test('si falla emitir el token anónimo, csrf devuelve 500 genérico', async t => {
  const { store, call } = await harness(t)
  t.mock.method(store, 'set', (_sid, _data, callback) => callback(new Error(internalDetail)))
  const response = await call('/api/auth/csrf')
  assert.equal(response.status, 500)
  assertSafe(response)
  assert.equal(response.body.csrfToken, undefined)
})

test('JSON inválido previo al router devuelve 400 seguro, sin el cuerpo ni el stack del parser', async t => {
  const { call } = await harness(t)
  const response = await call('/api/auth/login', { method: 'POST', rawBody: `{"password":"${password}",` })
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { message: 'JSON inválido' })
  assertSafe(response)
  assert.equal(lookups.length, 0)
})

test('el límite del parser devuelve 413 seguro antes de verificar credenciales', async t => {
  const { call } = await harness(t)
  const response = await call('/api/auth/login', { method: 'POST', body: { value: 'a'.repeat(110000) } })
  assert.equal(response.status, 413)
  assert.deepEqual(response.body, { message: 'Solicitud demasiado grande' })
  assertSafe(response)
  assert.equal(lookups.length, 0)
})

test('una codificación de JSON no admitida devuelve 415 seguro', async t => {
  const { call } = await harness(t)
  const response = await call('/api/auth/login', { method: 'POST', rawBody: '{}',
    headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } })
  assert.equal(response.status, 415)
  assertSafe(response)
})

test('los métodos no registrados y rutas desconocidas conservan el 404', async t => {
  const { call } = await harness(t)
  for (const [method, path] of [['GET', '/api/auth/login'], ['GET', '/api/auth/logout'],
    ['POST', '/api/auth/me'], ['POST', '/api/auth/csrf'], ['GET', '/api/auth/unknown']]) {
    assert.equal((await call(path, { method })).status, 404)
  }
})

test('el montaje compartido carga sesiones sin exigir autenticación ni CSRF a consumidores fuera de /api/auth', async t => {
  const { call, authenticate } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const response = await call('/api/probe', { method })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { ok: true, hasSession: true })
    assert.equal(response.headers['set-cookie'], undefined, 'La sesión anónima sin cambios no emite cookie')
  }
  const { cookie } = await authenticate()
  assert.deepEqual((await call('/api/probe', { cookie: cookie.pair })).body, { ok: true, hasSession: true })
})

test('GET csrf autenticado devuelve únicamente el token renovado sin consultar cuentas ni emitir otra cookie', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const queries = lookups.length
  const response = await call('/api/auth/csrf', { cookie: cookie.pair })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { csrfToken: token })
  assert.equal(response.headers['set-cookie'], undefined)
  assert.equal(lookups.length, queries)
  assertSafe(response)
})
