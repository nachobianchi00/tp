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

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/csrf.test.mjs
// Aplicación de pruebas desechable, ORM simulado y MemoryStore. Nunca se importa index.ts.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-csrf-tests/', import.meta.url)
const allowedOrigin = 'https://minigo.example'
const allowedOrigins = [allowedOrigin, 'http://localhost:5173']
const password = 'Contraseña ficticia exclusiva de pruebas CSRF 123!'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
const moduleMocks = []
let getCsrfToken, validateCsrfToken, validateRequestOrigin, createCsrfProtection, CSRF_TOKEN_TTL_MS
let createSessionMiddleware, createSession, getSessionIdentity, destroySession
let entities, storedHash, accounts, lookups

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
    guards.push(mock.method(target, method, () => { throw new Error('No se permite inicializar el ORM ni acceder a MySQL') }))
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  const options = ['--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck']
  execFileSync(process.execPath, [compiler, ...options, '--noEmitOnError', '--rootDir', 'src',
    '--outDir', fileURLToPath(compiledDir), 'src/shared/security/csrf.ts', 'src/auth/session.service.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  execFileSync(process.execPath, [compiler, ...options, '--noEmit', 'test/csrf-types.test.ts'], {
    cwd: backendDir, stdio: 'pipe', encoding: 'utf8',
  })
  moduleMocks.push(mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema() { throw new Error('No se permiten cambios de esquema') } },
  }))
  ;({ getCsrfToken, validateCsrfToken, validateRequestOrigin, createCsrfProtection, CSRF_TOKEN_TTL_MS }
    = await import(new URL('shared/security/csrf.js', compiledDir).href))
  ;({ createSessionMiddleware } = await import(new URL('shared/security/session.js', compiledDir).href))
  ;({ createSession, getSessionIdentity, destroySession } = await import(new URL('auth/session.service.js', compiledDir).href))
  const { Cliente } = await import(new URL('cliente/cliente.entity.js', compiledDir).href)
  const { Admin } = await import(new URL('admin/admin.entity.js', compiledDir).href)
  entities = { cliente: Cliente, admin: Admin }
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  process.env.SESSION_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-CSRF-1234567890'
  process.env.NODE_ENV = 'test'
  accounts = ['cliente', 'admin'].map((tipo, index) => Object.assign(new entities[tipo](), {
    id: 7 + index, mail: 'csrf@example.com', password: storedHash,
  }))
  lookups = []
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

function fakeRequest({ id = 'sesion-ficticia-uno', identity, authenticatedAt, saveError, synchronous = false } = {}) {
  let saved
  const save = mock.fn(callback => {
    if (synchronous) throw saveError
    setImmediate(() => {
      if (!saveError) saved = structuredClone(req.session.csrf)
      callback(saveError)
    })
  })
  const req = {
    method: 'POST', headers: { origin: allowedOrigin }, sessionID: id,
    session: { id, identity, authenticatedAt, cookie: new session.Cookie({ maxAge: CSRF_TOKEN_TTL_MS }), save },
  }
  return { req, save, stored: () => saved }
}

function expectForbidden(action) {
  assert.throws(action, error => error.statusCode === 403 && error.message === 'Solicitud CSRF inválida')
}

function middlewareResult(middleware, req) {
  const next = mock.fn()
  middleware(req, {}, next)
  assert.equal(next.mock.callCount(), 1)
  return next.mock.calls[0].arguments[0]
}

test('genera 32 bytes aleatorios, los guarda antes de devolverlos y permite una sesión anónima', async () => {
  const { req, save, stored } = fakeRequest()
  const beforeCreation = Date.now()
  const token = await getCsrfToken(req)
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.equal(Buffer.from(token, 'hex').length, 32)
  assert.equal(save.mock.callCount(), 1)
  assert.deepEqual(stored(), req.session.csrf)
  assert.equal(stored().sessionId, req.sessionID)
  assert.equal(stored().token, token)
  assert.ok(stored().expiresAt >= beforeCreation + CSRF_TOKEN_TTL_MS)
  assert.equal(req.session.identity, undefined)
  assert.equal(req.session.authenticatedAt, undefined)
  assert.equal(lookups.length, 0)
  validateCsrfToken(req, token)
})

test('reutiliza el token válido sin renovar su vencimiento ni volver a guardar', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { req, save } = fakeRequest()
  const token = await getCsrfToken(req)
  const expiresAt = req.session.csrf.expiresAt
  t.mock.timers.setTime(start + 10 * 60 * 1000)
  assert.equal(await getCsrfToken(req), token)
  assert.equal(req.session.csrf.expiresAt, expiresAt)
  assert.equal(save.mock.callCount(), 1)
})

test('cada sesión tiene un token distinto, incluso para la misma identidad', async () => {
  const identity = { id: 7, tipo: 'cliente' }
  const first = fakeRequest({ identity, authenticatedAt: Date.now(), id: 'sesion-uno' }).req
  const second = fakeRequest({ identity, authenticatedAt: Date.now(), id: 'sesion-dos' }).req
  const firstToken = await getCsrfToken(first)
  const secondToken = await getCsrfToken(second)
  assert.notEqual(firstToken, secondToken)
  validateCsrfToken(first, firstToken)
  validateCsrfToken(second, secondToken)
  expectForbidden(() => validateCsrfToken(second, firstToken))
  expectForbidden(() => validateCsrfToken(first, secondToken))
})

test('sin token guardado rechaza la solicitud y no crea ni guarda uno automáticamente', () => {
  const { req, save } = fakeRequest()
  expectForbidden(() => validateCsrfToken(req, 'a'.repeat(64)))
  assert.equal(req.session.csrf, undefined)
  assert.equal(save.mock.callCount(), 0)
})

test('rechaza tokens ausentes, de tipo incorrecto, incompletos y codificaciones alternativas', async () => {
  const { req } = fakeRequest()
  const token = await getCsrfToken(req)
  for (const invalid of [undefined, null, '', 123, {}, [], [token], token.slice(1), token + 'a',
    'z'.repeat(64), token.toUpperCase(), ' ' + token, token + ' ', token + '\n', `${token},${token}`]) {
    expectForbidden(() => validateCsrfToken(req, invalid))
  }
  validateCsrfToken(req, token)
})

test('un token manipulado de longitud correcta se rechaza sin modificar el token almacenado', async () => {
  const { req } = fakeRequest()
  const token = await getCsrfToken(req)
  const state = structuredClone(req.session.csrf)
  const changed = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
  expectForbidden(() => validateCsrfToken(req, changed))
  assert.deepEqual(req.session.csrf, state)
})

test('el error genérico no contiene el token recibido, el almacenado ni el ID de sesión', async () => {
  const { req } = fakeRequest()
  const token = await getCsrfToken(req)
  const changed = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
  assert.throws(() => validateCsrfToken(req, changed), error => {
    const output = JSON.stringify({ message: error.message, ...error })
    for (const value of [token, changed, req.sessionID]) assert.equal(output.includes(value), false)
    return error.statusCode === 403
  })
})

test('el token anónimo vence exactamente a los 30 minutos y solicitar otro invalida el anterior', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { req, save } = fakeRequest()
  const first = await getCsrfToken(req)
  t.mock.timers.setTime(start + CSRF_TOKEN_TTL_MS - 1)
  validateCsrfToken(req, first)
  t.mock.timers.setTime(start + CSRF_TOKEN_TTL_MS)
  expectForbidden(() => validateCsrfToken(req, first))
  const second = await getCsrfToken(req)
  assert.notEqual(second, first)
  assert.equal(req.session.csrf.expiresAt, start + 2 * CSRF_TOKEN_TTL_MS)
  expectForbidden(() => validateCsrfToken(req, first))
  validateCsrfToken(req, second)
  assert.equal(save.mock.callCount(), 2)
})

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: el token termina al vencer el plazo absoluto del login y no puede revivirlo`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start + 20 * 60 * 1000 })
    const { req, save } = fakeRequest({ identity: { id: 7, tipo }, authenticatedAt: start })
    const token = await getCsrfToken(req)
    assert.equal(req.session.csrf.expiresAt, start + CSRF_TOKEN_TTL_MS)
    t.mock.timers.setTime(start + CSRF_TOKEN_TTL_MS - 1)
    validateCsrfToken(req, token)
    req.session.cookie.maxAge = CSRF_TOKEN_TTL_MS
    // Simula un registro inconsistente con una fecha posterior: la fecha de login prevalece.
    req.session.csrf.expiresAt = start + 60 * 60 * 1000
    t.mock.timers.setTime(start + CSRF_TOKEN_TTL_MS)
    expectForbidden(() => validateCsrfToken(req, token))
    await assert.rejects(() => getCsrfToken(req), error => error.statusCode === 403)
    assert.equal(save.mock.callCount(), 1)
    assert.equal(req.session.authenticatedAt, start)
  })
}

test('copiar el estado CSRF a otro ID de sesión no permite reutilizar el token', async () => {
  const first = fakeRequest({ id: 'id-anterior' }).req
  const second = fakeRequest({ id: 'id-nuevo' }).req
  const token = await getCsrfToken(first)
  second.session.csrf = structuredClone(first.session.csrf)
  expectForbidden(() => validateCsrfToken(second, token))
  const renewed = await getCsrfToken(second)
  assert.notEqual(renewed, token)
  validateCsrfToken(second, renewed)
})

test('sin sesión, sin ID o con IDs inconsistentes no permite emitir ni validar tokens', async () => {
  for (const req of [{}, { sessionID: 'ficticio' }, fakeRequest({ id: '' }).req, fakeRequest().req]) {
    if (req.session?.id) req.sessionID = 'id-diferente'
    expectForbidden(() => validateCsrfToken(req, 'a'.repeat(64)))
    await assert.rejects(() => getCsrfToken(req), error => error.statusCode === 500)
  }
})

test('una identidad con fecha de login inválida no recibe protección como si fuera anónima', async () => {
  for (const authenticatedAt of [undefined, null, 'texto', 0, -1, NaN, Infinity, Date.now() + 60000]) {
    const { req } = fakeRequest({ identity: { id: 7, tipo: 'cliente' }, authenticatedAt })
    await assert.rejects(() => getCsrfToken(req), error => error.statusCode === 403)
  }
})

test('estados CSRF dañados no autentican solicitudes y se renuevan al pedir un token', async () => {
  const badStates = [null, 'texto', [], {}, { token: 'x'.repeat(64) },
    ...[undefined, null, 'mañana', NaN, Infinity, 0, Date.now() + 2 * CSRF_TOKEN_TTL_MS]
      .map(expiresAt => ({ token: 'a'.repeat(64), sessionId: 'sesion-ficticia-uno', expiresAt }))]
  for (const state of badStates) {
    const { req } = fakeRequest()
    req.session.csrf = state
    expectForbidden(() => validateCsrfToken(req, 'a'.repeat(64)))
    const renewed = await getCsrfToken(req)
    validateCsrfToken(req, renewed)
  }
})

for (const synchronous of [false, true]) {
  test(`un fallo ${synchronous ? 'síncrono' : 'del callback'} al guardar no devuelve token ni detalles internos`, async () => {
    const identity = { id: 7, tipo: 'cliente' }
    const { req } = fakeRequest({ identity, authenticatedAt: Date.now(), synchronous,
      saveError: new Error('Detalle privado ficticio del almacén') })
    await assert.rejects(() => getCsrfToken(req), error => {
      assert.equal(error.statusCode, 500)
      assert.equal(error.message, 'No se pudo preparar la protección CSRF')
      return true
    })
    assert.equal(req.session.csrf, undefined)
    assert.deepEqual(req.session.identity, identity)
  })
}

test('el origen permitido exige coincidencia completa de protocolo, host y puerto', () => {
  for (const origin of allowedOrigins) validateRequestOrigin({ headers: { origin } }, allowedOrigins)
  for (const origin of ['https://evil.example', 'https://minigo.example.evil.example', 'https://sub.minigo.example',
    'http://minigo.example', 'https://minigo.example:444', 'http://localhost:5174']) {
    expectForbidden(() => validateRequestOrigin({ headers: { origin } }, allowedOrigins))
  }
})

test('rechaza Origin nulo, múltiple, mal formado o con rutas aunque Referer sea permitido', () => {
  for (const origin of ['null', '', 'invalid', [], [allowedOrigin], `${allowedOrigin} https://evil.example`,
    `${allowedOrigin},https://evil.example`, `${allowedOrigin}/`, `${allowedOrigin}/ruta`,
    `${allowedOrigin}?query=1`, `${allowedOrigin}#fragment`, 'https://usuario@minigo.example',
    'https://minigo.example\\@evil.example', ` ${allowedOrigin}`, 'file:///tmp', 'https:///minigo.example']) {
    expectForbidden(() => validateRequestOrigin({ headers: { origin, referer: `${allowedOrigin}/cuenta` } }, allowedOrigins))
  }
})

test('sin Origin acepta Referer del origen permitido con ruta y parámetros', () => {
  for (const referer of [`${allowedOrigin}/cuenta`, `${allowedOrigin}/login?paso=1`, 'http://localhost:5173/login']) {
    validateRequestOrigin({ headers: { referer } }, allowedOrigins)
  }
})

test('sin Origin rechaza Referer ausente, múltiple, mal formado o de un origen externo', () => {
  for (const referer of [undefined, null, '', [], ['https://minigo.example/login'],
    'https://evil.example/?next=https://minigo.example', 'https://minigo.example.evil.example/login',
    '//minigo.example/login', 'https:minigo.example/login', 'https:///minigo.example/login',
    'https://usuario@minigo.example/login', 'https://minigo.example\\@evil.example',
    'https://minigo.example/login\u0000']) {
    expectForbidden(() => validateRequestOrigin({ headers: { referer } }, allowedOrigins))
  }
})

test('Host y cabeceras de proxy no convierten un origen externo en permitido', () => {
  expectForbidden(() => validateRequestOrigin({ headers: { origin: 'https://evil.example',
    host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' } }, allowedOrigins))
  expectForbidden(() => validateRequestOrigin({ headers: { host: 'minigo.example' } }, allowedOrigins))
})

test('la configuración exige una lista explícita sin comodines, paths ni orígenes opacos', () => {
  for (const origins of [undefined, null, [], '*', ['*'], ['null'], ['//minigo.example'],
    ['https://minigo.example/ruta'], ['https://usuario@minigo.example'], ['file:///tmp']]) {
    assert.throws(() => createCsrfProtection({ allowedOrigins: origins }), /CSRF/)
  }
})

test('el middleware mantiene una copia de los orígenes permitidos independiente de la lista original', async () => {
  const origins = [allowedOrigin]
  const middleware = createCsrfProtection({ allowedOrigins: origins })
  origins.push('https://evil.example')
  const { req } = fakeRequest()
  req.headers['x-csrf-token'] = await getCsrfToken(req)
  req.headers.origin = 'https://evil.example'
  assert.equal(middlewareResult(middleware, req).statusCode, 403)
})

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`${method}: el middleware requiere origen permitido y token correcto antes de continuar`, async () => {
    const { req } = fakeRequest()
    req.method = method
    const middleware = createCsrfProtection({ allowedOrigins })
    req.headers['x-csrf-token'] = await getCsrfToken(req)
    assert.equal(middlewareResult(middleware, req), undefined)
    delete req.headers['x-csrf-token']
    assert.equal(middlewareResult(middleware, req).statusCode, 403)
    req.headers['x-csrf-token'] = await getCsrfToken(req)
    req.headers.origin = 'https://evil.example'
    assert.equal(middlewareResult(middleware, req).statusCode, 403)
  })
}

test('GET, HEAD y OPTIONS no exigen tokens y no generan sesiones', () => {
  const middleware = createCsrfProtection({ allowedOrigins })
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const req = { method, headers: {} }
    assert.equal(middlewareResult(middleware, req), undefined)
    assert.equal(req.session, undefined)
  }
})

test('el middleware no acepta el token desde body, query, cookie o una cabecera múltiple', async () => {
  const { req } = fakeRequest()
  const middleware = createCsrfProtection({ allowedOrigins })
  const token = await getCsrfToken(req)
  req.body = { csrf: token, 'x-csrf-token': token }
  req.query = { csrf: token }
  req.headers.cookie = `csrf=${token}`
  assert.equal(middlewareResult(middleware, req).statusCode, 403)
  req.headers['x-csrf-token'] = [token, token]
  assert.equal(middlewareResult(middleware, req).statusCode, 403)
})

test('un token correcto no alcanza si faltan las dos cabeceras de origen', async () => {
  const { req } = fakeRequest()
  const middleware = createCsrfProtection({ allowedOrigins })
  req.headers['x-csrf-token'] = await getCsrfToken(req)
  delete req.headers.origin
  assert.equal(middlewareResult(middleware, req).statusCode, 403)
})

// Únicamente fixtures de prueba: no se agregan endpoints ni middleware al backend real.
async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  app.use(createSessionMiddleware(store))
  app.use(createCsrfProtection({ allowedOrigins }))
  app.get('/api/fixture-token', async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ token: await getCsrfToken(req) })
  })
  app.post('/api/fixture-change', (_req, res) => res.json({ ok: true }))
  app.post('/api/fixture-regenerate', async (req, res) => {
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()))
    res.json({ token: await getCsrfToken(req) })
  })
  app.post('/api/fixture-authenticate', async (req, res) => {
    const identity = await createSession(req, req.body)
    res.json({ identity, token: await getCsrfToken(req) })
  })
  app.get('/api/fixture-read', async (req, res) => res.json({ identity: await getSessionIdentity(req) }))
  app.post('/api/fixture-destroy', async (req, res) => {
    await destroySession(req)
    res.json({ ok: true })
  })
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ message: error.message }))
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const call = (path, { method = 'GET', cookie, token, origin, body } = {}) => new Promise((resolve, reject) => {
    const headers = {}
    if (cookie) headers.Cookie = cookie
    if (token) headers['X-CSRF-Token'] = token
    if (origin) headers.Origin = origin
    if (body) headers['Content-Type'] = 'application/json'
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end(body ? JSON.stringify(body) : undefined)
  })
  return { store, call }
}

function cookieFrom(response) {
  assert.ok(response.headers['set-cookie']?.[0])
  const header = response.headers['set-cookie'][0]
  const pair = header.split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return { pair, sid: value.slice(2, value.lastIndexOf('.')), header }
}
const getStored = (store, sid) => new Promise((resolve, reject) => store.get(sid, (error, value) => error ? reject(error) : resolve(value)))

test('MemoryStore real: emite cookie para sesión anónima y valida únicamente token + origen correctos', async t => {
  const { store, call } = await harness(t)
  const issuance = await call('/api/fixture-token')
  assert.equal(issuance.status, 200)
  assert.equal(issuance.headers['cache-control'], 'no-store')
  const cookie = cookieFrom(issuance)
  const token = issuance.body.token
  assert.equal(cookie.header.includes(token), false)
  const stored = await getStored(store, cookie.sid)
  assert.equal(stored.identity, undefined)
  assert.equal(stored.csrf.token, token)
  assert.equal(stored.csrf.sessionId, cookie.sid)
  const valid = await call('/api/fixture-change', { method: 'POST', cookie: cookie.pair, token, origin: allowedOrigin })
  assert.equal(valid.status, 200)
  for (const options of [{ cookie: cookie.pair }, { cookie: cookie.pair, token }, { token, origin: allowedOrigin },
    { cookie: cookie.pair, token, origin: 'https://evil.example' }]) {
    const invalid = await call('/api/fixture-change', { method: 'POST', ...options })
    assert.equal(invalid.status, 403)
    assert.deepEqual(invalid.body, { message: 'Solicitud CSRF inválida' })
  }
})

test('regenerar una sesión anónima cambia el token y rechaza el anterior con la nueva cookie', async t => {
  const { store, call } = await harness(t)
  const first = await call('/api/fixture-token')
  const oldCookie = cookieFrom(first)
  const regenerated = await call('/api/fixture-regenerate', {
    method: 'POST', cookie: oldCookie.pair, token: first.body.token, origin: allowedOrigin,
  })
  assert.equal(regenerated.status, 200)
  const newCookie = cookieFrom(regenerated)
  assert.notEqual(newCookie.sid, oldCookie.sid)
  assert.notEqual(regenerated.body.token, first.body.token)
  assert.equal(await getStored(store, oldCookie.sid), undefined)
  assert.equal((await call('/api/fixture-change', {
    method: 'POST', cookie: newCookie.pair, token: first.body.token, origin: allowedOrigin,
  })).status, 403)
  assert.equal((await call('/api/fixture-change', {
    method: 'POST', cookie: newCookie.pair, token: regenerated.body.token, origin: allowedOrigin,
  })).status, 200)
})

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: la operación real de login elimina el token anónimo y permite emitir uno nuevo`, async t => {
    const { store, call } = await harness(t)
    const first = await call('/api/fixture-token')
    const oldCookie = cookieFrom(first)
    const authenticated = await call('/api/fixture-authenticate', {
      method: 'POST', cookie: oldCookie.pair, token: first.body.token, origin: allowedOrigin,
      body: { tipo, mail: 'csrf@example.com', password },
    })
    assert.equal(authenticated.status, 200)
    assert.deepEqual(authenticated.body.identity, { id: tipo === 'cliente' ? 7 : 8, tipo })
    const cookie = cookieFrom(authenticated)
    assert.notEqual(cookie.sid, oldCookie.sid)
    assert.notEqual(authenticated.body.token, first.body.token)
    assert.equal(await getStored(store, oldCookie.sid), undefined)
    assert.equal((await call('/api/fixture-change', {
      method: 'POST', cookie: cookie.pair, token: first.body.token, origin: allowedOrigin,
    })).status, 403)
    assert.equal((await call('/api/fixture-change', {
      method: 'POST', cookie: cookie.pair, token: authenticated.body.token, origin: allowedOrigin,
    })).status, 200)
  })
}

test('rechaza un intento de login sin token antes de consultar las credenciales', async t => {
  const { call } = await harness(t)
  const first = await call('/api/fixture-token')
  const cookie = cookieFrom(first)
  const result = await call('/api/fixture-authenticate', {
    method: 'POST', cookie: cookie.pair, origin: allowedOrigin,
    body: { tipo: 'cliente', mail: 'csrf@example.com', password },
  })
  assert.equal(result.status, 403)
  assert.equal(lookups.length, 0)
})

test('MemoryStore real: la actividad no permite usar tokens después del vencimiento absoluto del login', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call } = await harness(t)
  const first = await call('/api/fixture-token')
  const authenticated = await call('/api/fixture-authenticate', {
    method: 'POST', cookie: cookieFrom(first).pair, token: first.body.token, origin: allowedOrigin,
    body: { tipo: 'cliente', mail: 'csrf@example.com', password },
  })
  const cookie = cookieFrom(authenticated)
  const token = authenticated.body.token
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  assert.equal((await call('/api/fixture-read', { cookie: cookie.pair })).body.identity.id, 7)
  t.mock.timers.setTime(start + CSRF_TOKEN_TTL_MS)
  const stored = await getStored(store, cookie.sid)
  assert.ok(Date.parse(stored.cookie.expires) > Date.now())
  assert.equal((await call('/api/fixture-change', { method: 'POST', cookie: cookie.pair, token, origin: allowedOrigin })).status, 403)
  assert.equal((await call('/api/fixture-token', { cookie: cookie.pair })).status, 403)
})

test('destruir la sesión impide reutilizar su cookie y su token CSRF', async t => {
  const { store, call } = await harness(t)
  const first = await call('/api/fixture-token')
  const cookie = cookieFrom(first)
  const token = first.body.token
  assert.equal((await call('/api/fixture-destroy', { method: 'POST', cookie: cookie.pair, token, origin: allowedOrigin })).status, 200)
  assert.equal(await getStored(store, cookie.sid), undefined)
  assert.equal((await call('/api/fixture-change', { method: 'POST', cookie: cookie.pair, token, origin: allowedOrigin })).status, 403)
})
