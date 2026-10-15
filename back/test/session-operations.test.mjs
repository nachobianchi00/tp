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

// Desde back/, con Node 24:
// node --experimental-test-module-mocks --test test/session-operations.test.mjs
// ORM simulado y MemoryStore: nunca se importa index.ts ni se accede a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-session-operations-tests/', import.meta.url)
const password = '  Contraseña ficticia de sesiones 123!  '
const guards = []
const moduleMocks = []
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
let createSession, getSessionIdentity, destroySession, createSessionMiddleware, SESSION_TTL_MS
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
    guards.push(mock.method(target, method, () => {
      throw new Error('Estas pruebas no permiten inicializar el ORM ni acceder a MySQL')
    }))
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  const typeOptions = [
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
  ]
  execFileSync(process.execPath, [compiler, ...typeOptions, '--noEmitOnError',
    '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir), 'src/auth/session.service.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  execFileSync(process.execPath, [compiler, ...typeOptions, '--noEmit', 'test/session-operations-types.test.ts'], {
    cwd: backendDir, stdio: 'pipe', encoding: 'utf8',
  })
  moduleMocks.push(mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema() { throw new Error('No se permiten cambios de esquema') } },
  }))
  const { Cliente } = await import(new URL('cliente/cliente.entity.js', compiledDir).href)
  const { Admin } = await import(new URL('admin/admin.entity.js', compiledDir).href)
  entities = { cliente: Cliente, admin: Admin }
  ;({ createSession, getSessionIdentity, destroySession } = await import(new URL('auth/session.service.js', compiledDir).href))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await import(new URL('shared/security/session.js', compiledDir).href))
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  process.env.SESSION_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-de-operaciones-1234567890'
  process.env.NODE_ENV = 'test'
  accounts = ['cliente', 'admin'].map((tipo, index) => Object.assign(new entities[tipo](), {
    id: 7 + index, mail: 'sesiones@example.com', password: storedHash,
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

const credentials = (tipo = 'cliente', overrides = {}) => ({ tipo, mail: 'sesiones@example.com', password, ...overrides })
const expectedIdentity = tipo => ({ id: tipo === 'cliente' ? 7 : 8, tipo })

// Doble para provocar fallos de callbacks, excepciones y guardados parciales sin ningún almacén externo.
function fakeRequest({ fail, synchronous = false, replacementOnError = false, cleanupFails = false } = {}) {
  const events = []
  const persisted = new Map()
  let nextId = 0
  const req = {}
  const oldIdentity = { id: 42, tipo: 'cliente' }
  function makeSession(identity) {
    const index = nextId++
    const current = {
      id: index === 0 ? 'id-anterior' : index === 1 ? 'id-regenerado' : `id-regenerado-${index}`,
      cookie: new session.Cookie({ maxAge: SESSION_TTL_MS }),
      ...(identity ? { identity, authenticatedAt: Date.now() - 1000 } : {}),
      regenerate(callback) {
        events.push('regenerate')
        assert.ok(lookups.length > 0, 'Se verifican las credenciales antes de regenerar')
        if (fail === 'regenerate') {
          if (replacementOnError) req.session = makeSession(oldIdentity)
          if (synchronous) throw new Error('Detalle privado ficticio de regeneración')
          return setImmediate(() => callback(new Error('Detalle privado ficticio de regeneración')))
        }
        persisted.delete(current.id)
        req.session = makeSession()
        setImmediate(() => callback())
      },
      save(callback) {
        events.push('save')
        // Incluye el caso de un almacén que escribe y después informa un error.
        persisted.set(current.id, { identity: { ...current.identity }, authenticatedAt: current.authenticatedAt })
        if (fail === 'save') {
          if (synchronous) throw new Error('Detalle privado ficticio de guardado')
          return setImmediate(() => callback(new Error('Detalle privado ficticio de guardado')))
        }
        setImmediate(() => callback())
      },
      destroy(callback) {
        events.push('destroy')
        assert.equal(current.identity, undefined, 'Se quita la identidad local antes de destruir')
        assert.equal(current.authenticatedAt, undefined)
        delete req.session
        if (fail === 'destroy' || cleanupFails) {
          if (synchronous) throw new Error('Detalle privado ficticio de destrucción')
          return setImmediate(() => callback(new Error('Detalle privado ficticio de destrucción')))
        }
        persisted.delete(current.id)
        setImmediate(() => callback())
      },
    }
    return current
  }
  req.session = makeSession(oldIdentity)
  persisted.set(req.session.id, { identity: oldIdentity, authenticatedAt: req.session.authenticatedAt })
  return { req, events, persisted }
}

async function expectServiceError(action, statusCode, message) {
  await assert.rejects(action, error => {
    assert.equal(error.statusCode, statusCode)
    assert.equal(error.message, message)
    assert.equal(Object.hasOwn(error, 'credentials'), false)
    assert.equal(Object.hasOwn(error, 'password'), false)
    return true
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: verifica credenciales, regenera y espera el guardado de una identidad segura`, async () => {
    const { req, events, persisted } = fakeRequest()
    const identity = await createSession(req, credentials(tipo, { id: 999, identity: { id: 999, tipo: 'admin' } }))
    assert.deepEqual(identity, expectedIdentity(tipo))
    assert.deepEqual(events, ['regenerate', 'save'])
    assert.equal(req.session.id, 'id-regenerado')
    assert.equal(persisted.has('id-anterior'), false)
    assert.deepEqual(persisted.get('id-regenerado').identity, expectedIdentity(tipo))
    assert.equal(req.session.cookie.originalMaxAge, SESSION_TTL_MS)
    assert.deepEqual(Object.keys(req.session.identity).sort(), ['id', 'tipo'])
    assert.equal(lookups[0].entity, entities[tipo])
    identity.id = 999
    assert.equal(req.session.identity.id, expectedIdentity(tipo).id)
  })

  test(`${tipo}: consulta devuelve una copia segura sin volver a consultar cuentas`, async () => {
    const { req, events } = fakeRequest()
    req.session.identity = { ...expectedIdentity(tipo), password: 'dato ficticio que nunca debe devolverse' }
    const start = req.session.authenticatedAt
    const identity = await getSessionIdentity(req)
    assert.deepEqual(identity, expectedIdentity(tipo))
    identity.tipo = tipo === 'cliente' ? 'admin' : 'cliente'
    assert.equal(req.session.identity.tipo, tipo)
    assert.equal(req.session.authenticatedAt, start)
    assert.deepEqual(events, [])
    assert.equal(lookups.length, 0)
  })

  test(`${tipo}: vence en el instante exacto de 30 minutos y elimina la identidad`, async t => {
    const start = Date.parse('2026-10-10T12:00:00Z')
    t.mock.timers.enable({ apis: ['Date'], now: start })
    const { req, events, persisted } = fakeRequest()
    await createSession(req, credentials(tipo))
    assert.equal(req.session.authenticatedAt, start)
    t.mock.timers.setTime(start + SESSION_TTL_MS - 1)
    assert.deepEqual(await getSessionIdentity(req), expectedIdentity(tipo))
    t.mock.timers.setTime(start + SESSION_TTL_MS)
    assert.equal(await getSessionIdentity(req), null)
    assert.equal(req.session, undefined)
    assert.equal(persisted.size, 0)
    assert.deepEqual(events, ['regenerate', 'save', 'destroy'])
  })
}

test('credenciales incorrectas conservan la sesión previa sin regenerarla ni guardarla', async () => {
  const { req, events } = fakeRequest()
  const current = req.session
  const start = current.authenticatedAt
  await expectServiceError(() => createSession(req, credentials('cliente', { password: 'contraseña ficticia incorrecta' })), 401, 'Credenciales inválidas')
  assert.equal(req.session, current)
  assert.deepEqual(req.session.identity, { id: 42, tipo: 'cliente' })
  assert.equal(req.session.authenticatedAt, start)
  assert.deepEqual(events, [])
})

test('credenciales mal formadas se rechazan antes de operar con sesiones o consultar cuentas', async () => {
  const { req, events } = fakeRequest()
  await assert.rejects(() => createSession(req, credentials('cliente', { password: '' })), error => error.statusCode === 400)
  assert.deepEqual(events, [])
  assert.equal(lookups.length, 0)
})

test('un fallo de verificación se propaga sin crear, destruir ni guardar sesiones', async () => {
  const { req, events } = fakeRequest()
  lookupFailure = new Error('Detalle privado ficticio de lectura de cuenta')
  await expectServiceError(() => createSession(req, credentials()), 500, 'No se pudieron verificar las credenciales')
  assert.deepEqual(events, [])
})

test('sin middleware de sesiones el login falla de forma genérica sin consultar cuentas', async () => {
  await expectServiceError(() => createSession({}, credentials()), 500, 'No se pudo iniciar la sesión')
  assert.equal(lookups.length, 0)
})

test('consultar o destruir una sesión ausente es seguro e idempotente', async () => {
  assert.equal(await getSessionIdentity({}), null)
  assert.equal(await destroySession({}), undefined)
  assert.equal(lookups.length, 0)
})

test('consultar una sesión anónima no la guarda, modifica ni destruye', async () => {
  const { req, events } = fakeRequest()
  delete req.session.identity
  delete req.session.authenticatedAt
  const current = req.session
  assert.equal(await getSessionIdentity(req), null)
  assert.equal(req.session, current)
  assert.deepEqual(events, [])
})

for (const synchronous of [false, true]) {
  const failureType = synchronous ? 'excepción síncrona' : 'error del callback'
  test(`regeneración: ${failureType} impide guardar y descarta la identidad local`, async () => {
    const { req, events } = fakeRequest({ fail: 'regenerate', synchronous })
    const current = req.session
    await expectServiceError(() => createSession(req, credentials()), 500, 'No se pudo iniciar la sesión')
    assert.equal(current.identity, undefined)
    assert.equal(req.session, undefined)
    assert.deepEqual(events, ['regenerate', 'destroy'])
  })

  test(`guardado: ${failureType} revierte también un registro parcialmente guardado`, async () => {
    const { req, events, persisted } = fakeRequest({ fail: 'save', synchronous })
    await expectServiceError(() => createSession(req, credentials()), 500, 'No se pudo guardar la sesión')
    assert.equal(req.session, undefined)
    assert.equal(persisted.size, 0)
    assert.deepEqual(events, ['regenerate', 'save', 'destroy'])
  })

  test(`destrucción: ${failureType} devuelve 500 y quita la identidad local`, async () => {
    const { req, events, persisted } = fakeRequest({ fail: 'destroy', synchronous })
    const current = req.session
    await expectServiceError(() => destroySession(req), 500, 'No se pudo cerrar la sesión')
    assert.equal(current.identity, undefined)
    assert.equal(current.authenticatedAt, undefined)
    assert.equal(req.session, undefined)
    assert.deepEqual(events, ['destroy'])
    // Un fallo del almacén no garantiza revocación: se informa un error, no éxito.
    assert.equal(persisted.size, 1)
  })
}

test('regeneración fallida limpia tanto la sesión anterior como una nueva instancia creada con error', async () => {
  const { req, events } = fakeRequest({ fail: 'regenerate', replacementOnError: true })
  const previous = req.session
  await expectServiceError(() => createSession(req, credentials()), 500, 'No se pudo iniciar la sesión')
  assert.equal(previous.identity, undefined)
  assert.equal(req.session, undefined)
  assert.deepEqual(events, ['regenerate', 'destroy'])
})

test('si también falla la limpieza se conserva el error genérico de guardado y no se concede acceso', async () => {
  const { req, events } = fakeRequest({ fail: 'save', cleanupFails: true })
  await expectServiceError(() => createSession(req, credentials()), 500, 'No se pudo guardar la sesión')
  assert.equal(req.session, undefined)
  assert.deepEqual(events, ['regenerate', 'save', 'destroy'])
})

test('destruir espera el almacén, elimina el registro y permite repetir la operación', async () => {
  const { req, events, persisted } = fakeRequest()
  await destroySession(req)
  assert.equal(persisted.size, 0)
  assert.equal(await getSessionIdentity(req), null)
  await destroySession(req)
  assert.deepEqual(events, ['destroy'])
})

test('identidades inválidas o incompletas se eliminan y nunca autentican', async () => {
  for (const identity of [null, 'cliente', {}, { id: 0, tipo: 'cliente' }, { id: -1, tipo: 'cliente' },
    { id: '7', tipo: 'cliente' }, { id: 1.5, tipo: 'cliente' }, { id: 7, tipo: 'superadmin' }, undefined]) {
    const { req, events } = fakeRequest()
    req.session.identity = identity
    assert.equal(await getSessionIdentity(req), null)
    assert.equal(req.session, undefined)
    assert.deepEqual(events, ['destroy'])
  }
})

test('una identidad sin fecha válida de login se elimina sin inventar un nuevo vencimiento', async () => {
  for (const authenticatedAt of [undefined, null, '2026-10-10', NaN, Infinity, 0, -1, 1.5, Date.now() + 60000]) {
    const { req, events } = fakeRequest()
    req.session.authenticatedAt = authenticatedAt
    assert.equal(await getSessionIdentity(req), null)
    assert.deepEqual(events, ['destroy'])
  }
})

test('una fecha sin identidad también se descarta como sesión inconsistente', async () => {
  const { req, events } = fakeRequest()
  delete req.session.identity
  assert.equal(await getSessionIdentity(req), null)
  assert.deepEqual(events, ['destroy'])
})

test('actividad y cambios de vencimiento de la cookie no prolongan el límite absoluto', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { req, events } = fakeRequest()
  await createSession(req, credentials())
  for (const minutes of [5, 10, 20, 29]) {
    t.mock.timers.setTime(start + minutes * 60 * 1000)
    req.session.cookie.maxAge = SESSION_TTL_MS
    assert.deepEqual(await getSessionIdentity(req), expectedIdentity('cliente'))
    assert.equal(req.session.authenticatedAt, start)
  }
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.ok(req.session.cookie.maxAge > 0, 'La cookie todavía aparenta estar vigente')
  assert.equal(await getSessionIdentity(req), null)
  assert.deepEqual(events, ['regenerate', 'save', 'destroy'])
})

test('un nuevo login regenera otra vez y comienza un nuevo plazo de 30 minutos', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { req, events } = fakeRequest()
  await createSession(req, credentials('cliente'))
  const firstId = req.session.id
  t.mock.timers.setTime(start + 20 * 60 * 1000)
  await createSession(req, credentials('admin'))
  assert.notEqual(req.session.id, firstId)
  assert.equal(req.session.authenticatedAt, start + 20 * 60 * 1000)
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  assert.deepEqual(await getSessionIdentity(req), expectedIdentity('admin'))
  t.mock.timers.setTime(start + 50 * 60 * 1000)
  assert.equal(await getSessionIdentity(req), null)
  assert.deepEqual(events, ['regenerate', 'save', 'regenerate', 'save', 'destroy'])
})

test('si falla destruir una sesión vencida no devuelve identidad y comunica el error', async () => {
  const { req } = fakeRequest({ fail: 'destroy' })
  req.session.authenticatedAt = Date.now() - SESSION_TTL_MS
  await expectServiceError(() => getSessionIdentity(req), 500, 'No se pudo cerrar la sesión')
  assert.equal(req.session, undefined)
})

// Aplicación desechable de pruebas. Estas rutas no se agregan a los módulos ni al backend real.
async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  app.use(createSessionMiddleware(store))
  app.post('/api/fixture-anonymous', (req, res) => {
    req.session.marker = 'dato ficticio anterior al login'
    res.json({ ok: true })
  })
  app.post('/api/fixture-create', async (req, res) => res.json(await createSession(req, req.body)))
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
  const call = (path, { method = 'GET', cookie, body } = {}) => new Promise((resolve, reject) => {
    const headers = {}
    if (cookie) headers.Cookie = cookie
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
  const pair = response.headers['set-cookie'][0].split(';')[0]
  const value = decodeURIComponent(pair.slice(pair.indexOf('=') + 1))
  return { pair, sid: value.slice(2, value.lastIndexOf('.')) }
}
const getStored = (store, sid) => new Promise((resolve, reject) => store.get(sid, (error, value) => error ? reject(error) : resolve(value)))

for (const tipo of ['cliente', 'admin']) {
  test(`MemoryStore + express-session real: ${tipo} cambia el ID y la cookie anterior no autentica`, async t => {
    const { store, call } = await harness(t)
    const anonymous = cookieFrom(await call('/api/fixture-anonymous', { method: 'POST' }))
    const response = await call('/api/fixture-create', { method: 'POST', cookie: anonymous.pair, body: credentials(tipo) })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, expectedIdentity(tipo))
    const authenticated = cookieFrom(response)
    assert.notEqual(authenticated.sid, anonymous.sid)
    assert.equal(await getStored(store, anonymous.sid), undefined)
    const stored = await getStored(store, authenticated.sid)
    assert.deepEqual(stored.identity, expectedIdentity(tipo))
    assert.equal(stored.marker, undefined, 'No conserva datos de la sesión anterior')
    assert.equal(typeof stored.authenticatedAt, 'number')
    assert.equal(stored.password, undefined)
    const oldProbe = await call('/api/fixture-read', { cookie: anonymous.pair })
    assert.deepEqual(oldProbe.body, { identity: null })
    const currentProbe = await call('/api/fixture-read', { cookie: authenticated.pair })
    assert.deepEqual(currentProbe.body, { identity: expectedIdentity(tipo) })
  })
}

test('MemoryStore real: su renovación por actividad no evita el vencimiento absoluto del servidor', async t => {
  const start = Date.parse('2026-10-10T12:00:00Z')
  t.mock.timers.enable({ apis: ['Date'], now: start })
  const { store, call } = await harness(t)
  const cookie = cookieFrom(await call('/api/fixture-create', { method: 'POST', body: credentials() }))
  for (const minutes of [10, 20, 29]) {
    t.mock.timers.setTime(start + minutes * 60 * 1000)
    const response = await call('/api/fixture-read', { cookie: cookie.pair })
    assert.deepEqual(response.body, { identity: expectedIdentity('cliente') })
    assert.equal((await getStored(store, cookie.sid)).authenticatedAt, start)
  }
  t.mock.timers.setTime(start + SESSION_TTL_MS)
  const stored = await getStored(store, cookie.sid)
  assert.ok(Date.parse(stored.cookie.expires) > Date.now(), 'MemoryStore extendió su vencimiento por actividad')
  const expired = await call('/api/fixture-read', { cookie: cookie.pair })
  assert.equal(expired.status, 200)
  assert.deepEqual(expired.body, { identity: null })
  assert.equal(await getStored(store, cookie.sid), undefined)
})

test('MemoryStore real: destruir elimina el registro y reutilizar la cookie no autentica', async t => {
  const { store, call } = await harness(t)
  const cookie = cookieFrom(await call('/api/fixture-create', { method: 'POST', body: credentials('admin') }))
  const result = await call('/api/fixture-destroy', { method: 'POST', cookie: cookie.pair })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { ok: true })
  assert.equal(await getStored(store, cookie.sid), undefined)
  assert.deepEqual((await call('/api/fixture-read', { cookie: cookie.pair })).body, { identity: null })
  assert.equal((await call('/api/fixture-destroy', { method: 'POST', cookie: cookie.pair })).status, 200)
})
