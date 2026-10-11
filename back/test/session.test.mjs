import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createServer, request } from 'node:http'
import { after, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import express from 'express'
import session from 'express-session'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import {
  createSessionMiddleware, createSessionOptions, SESSION_COOKIE_NAME, SESSION_TTL_MS,
} from '../src/shared/security/session.ts'

// Desde back/, con Node 24: node --test test/session.test.mjs
// Las rutas fixture/probe existen SOLO en estas pruebas; no se importa index.ts ni el ORM real.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const TEST_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-1234567890'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []

before(() => {
  for (const [target, method] of [
    [MikroORM, 'init'],
    ...['connect', 'ensureConnection', 'execute'].map(method => [MySqlConnection.prototype, method]),
  ]) {
    guards.push(mock.method(target, method, () => {
      throw new Error('Estas pruebas no permiten inicializar el ORM ni acceder a MySQL')
    }))
  }
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--noEmit', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--strict', '--esModuleInterop',
    '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    'src/shared/security/session.ts', 'test/session-types.test.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
})

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET
  process.env.NODE_ENV = 'test'
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0)
  } finally {
    for (const guard of guards) guard.mock.restore()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

async function harness(t, { store = new session.MemoryStore(), tipo = 'cliente', trustProxy = false } = {}) {
  const app = express()
  if (trustProxy) app.set('trust proxy', 'loopback')
  app.use(createSessionMiddleware(store))
  app.post('/api/fixture', (req, res) => {
    // Simula un dato de sesión: no verifica credenciales ni implementa un login.
    req.session.identity = { id: 7, tipo }
    res.json({ ok: true })
  })
  app.get('/api/probe', (req, res) => res.json({ identity: req.session?.identity ?? null }))
  app.get('/outside', (req, res) => res.json({ hasSession: Boolean(req.session) }))
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

  const call = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end()
  })
  return { store, call }
}

function cookieFrom(response) {
  const header = response.headers['set-cookie']?.[0]
  assert.ok(header, 'Debe emitirse una cookie de sesión')
  const pair = header.split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  assert.ok(value.startsWith('s:'), 'El identificador debe estar firmado')
  const separator = value.lastIndexOf('.')
  return { header, pair, sid: value.slice(2, separator), signature: value.slice(separator + 1) }
}

const getStored = (store, sid) => new Promise((resolve, reject) => {
  store.get(sid, (error, value) => error ? reject(error) : resolve(value))
})

test('exige SESSION_SECRET sin usar un secreto predeterminado ni revelar el valor inválido', () => {
  for (const secret of [undefined, '', '   ', 'ficticio-corto']) {
    if (secret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = secret
    assert.throws(() => createSessionMiddleware(), { message: 'SESSION_SECRET must contain at least 32 bytes' })
  }
})

test('en producción rechaza el almacén predeterminado y MemoryStore, incluso sus subclases', () => {
  process.env.NODE_ENV = 'production'
  class TestMemoryStore extends session.MemoryStore {}
  for (const store of [undefined, new session.MemoryStore(), new TestMemoryStore()]) {
    assert.throws(() => createSessionMiddleware(store), /Production requires a suitable session store/)
  }
})

test('en producción configura Secure al recibir un almacén explícito distinto de MemoryStore', () => {
  process.env.NODE_ENV = 'production'
  // Solo se inspecciona configuración; este objeto no representa un almacén listo para desplegar.
  const store = new session.Store()
  const options = createSessionOptions(store)
  assert.equal(options.cookie.secure, true)
  assert.equal(options.store, store)
})

test('una visita que no modifica la sesión no crea cookies ni registros en memoria', async t => {
  const { store, call } = await harness(t)
  const response = await call('/api/probe')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { identity: null })
  assert.equal(response.headers['set-cookie'], undefined)
  const length = await new Promise((resolve, reject) => store.length((error, value) => error ? reject(error) : resolve(value)))
  assert.equal(length, 0)
})

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: la cookie contiene un ID firmado y la identidad queda en el servidor`, async t => {
    const { store, call } = await harness(t, { tipo })
    const response = await call('/api/fixture', { method: 'POST' })
    assert.equal(response.status, 200)
    const cookie = cookieFrom(response)
    const expectedSignature = createHmac('sha256', TEST_SECRET).update(cookie.sid).digest('base64').replace(/=+$/, '')
    assert.equal(cookie.signature, expectedSignature)
    const stored = await getStored(store, cookie.sid)
    assert.deepEqual(stored.identity, { id: 7, tipo })
    const probe = await call('/api/probe', { headers: { Cookie: cookie.pair } })
    assert.deepEqual(probe.body, { identity: { id: 7, tipo } })
    assert.equal(cookie.header.includes(TEST_SECRET), false)
    assert.equal(cookie.header.includes(tipo), false)
    assert.equal(cookie.header.includes('password'), false)
  })
}

test('en HTTP local emite HttpOnly, SameSite=Lax, Path=/api y vencimiento inicial de 30 minutos', async t => {
  const { store, call } = await harness(t)
  const beforeRequest = Date.now()
  const cookie = cookieFrom(await call('/api/fixture', { method: 'POST' }))
  const stored = await getStored(store, cookie.sid)
  assert.match(cookie.header, /; HttpOnly(?:;|$)/)
  assert.match(cookie.header, /; SameSite=Lax(?:;|$)/)
  assert.match(cookie.header, /; Path=\/api(?:;|$)/)
  assert.doesNotMatch(cookie.header, /; Secure(?:;|$)/)
  assert.doesNotMatch(cookie.header, /; Domain=/)
  assert.equal(stored.cookie.originalMaxAge, 30 * 60 * 1000)
  assert.equal(SESSION_TTL_MS, 30 * 60 * 1000)
  const expires = Date.parse(cookie.header.match(/; Expires=([^;]+)/)[1])
  assert.ok(expires >= beforeRequest + SESSION_TTL_MS - 1000)
  assert.ok(expires <= Date.now() + SESSION_TTL_MS)
})

test('en una solicitud HTTPS reconocida emite Secure y no confía en cabeceras de un proxy sin configurar', async t => {
  const trusted = await harness(t, { trustProxy: true })
  const secureCookie = cookieFrom(await trusted.call('/api/fixture', {
    method: 'POST', headers: { 'X-Forwarded-Proto': 'https' },
  }))
  assert.match(secureCookie.header, /; Secure(?:;|$)/)

  const untrusted = await harness(t)
  const httpCookie = cookieFrom(await untrusted.call('/api/fixture', {
    method: 'POST', headers: { 'X-Forwarded-Proto': 'https' },
  }))
  assert.doesNotMatch(httpCookie.header, /; Secure(?:;|$)/)
})

test('rechaza firmas manipuladas e identificadores sin firma aunque la sesión exista', async t => {
  const { call } = await harness(t)
  const cookie = cookieFrom(await call('/api/fixture', { method: 'POST' }))
  const changed = cookie.signature.slice(0, -1) + (cookie.signature.endsWith('a') ? 'b' : 'a')
  for (const value of [`s:${cookie.sid}.${changed}`, cookie.sid]) {
    const response = await call('/api/probe', { headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}` } })
    assert.deepEqual(response.body, { identity: null })
    assert.equal(response.headers['set-cookie'], undefined)
  }
})

test('una cookie firmada con otro secreto no recupera la identidad del mismo almacén', async t => {
  const first = await harness(t)
  const cookie = cookieFrom(await first.call('/api/fixture', { method: 'POST' }))
  process.env.SESSION_SECRET = 'otro-secreto-ficticio-de-pruebas-1234567890'
  const second = await harness(t, { store: first.store })
  const response = await second.call('/api/probe', { headers: { Cookie: cookie.pair } })
  assert.deepEqual(response.body, { identity: null })
})

test('una sesión sin actividad vence en el servidor a los 30 minutos, incluso si se reenvía la cookie', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call } = await harness(t)
  const cookie = cookieFrom(await call('/api/fixture', { method: 'POST' }))
  t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
  assert.ok(await getStored(store, cookie.sid))
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  const response = await call('/api/probe', { headers: { Cookie: cookie.pair } })
  assert.deepEqual(response.body, { identity: null })
  assert.equal(await getStored(store, cookie.sid), undefined)
})

test('una lectura no vuelve a guardar ni emitir cookies, pero MemoryStore puede renovar su duración', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call } = await harness(t)
  const set = t.mock.method(store, 'set')
  const cookie = cookieFrom(await call('/api/fixture', { method: 'POST' }))
  assert.equal(set.mock.callCount(), 1)
  t.mock.timers.setTime(start + 10 * 60 * 1000)
  const response = await call('/api/probe', { headers: { Cookie: cookie.pair } })
  assert.deepEqual(response.body, { identity: { id: 7, tipo: 'cliente' } })
  assert.equal(response.headers['set-cookie'], undefined)
  assert.equal(set.mock.callCount(), 1)
  const stored = await getStored(store, cookie.sid)
  assert.equal(Date.parse(stored.cookie.expires), start + 10 * 60 * 1000 + SESSION_TTL_MS)
  // Un límite absoluto desde el login requiere lógica adicional en 3.2.b.
})

test('el middleware no procesa solicitudes fuera del alcance /api', async t => {
  const { call } = await harness(t)
  const response = await call('/outside')
  assert.deepEqual(response.body, { hasSession: false })
  assert.equal(response.headers['set-cookie'], undefined)
})
