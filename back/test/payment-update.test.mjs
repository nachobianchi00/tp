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
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'

// Desde back/: node --experimental-test-module-mocks --test test/payment-update.test.mjs
// PUT y router reales, almacenamiento simulado y barreras contra conexiones/SQL/syncSchema.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-payment-update-tests/', import.meta.url)
const origin = 'https://minigo.example'
const internalDetail = 'SELECT password FROM cliente; $argon2id$hash-ficticio; Cookie: minigo.sid=ficticia; SESSION_SECRET=ficticio; C:\\servidor\\orm.ts:15'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, serviceMock, Pago, EstadoPago, ServiceError, updatePago, createPagoRouter, pagoErrorHandler
let createSessionMiddleware, getCsrfToken, SESSION_TTL_MS
let record, assignments, flushes, queries, serviceCalls

// El doble asignaría cualquier clave; la defensa debe ejecutarse en el servicio real.
const em = {
  // Las sesiones de estas pruebas pertenecen a cuentas ficticias de ID 7.
  async count(Entity, criteria) {
    assert.ok(['Cliente', 'Admin'].includes(Entity.name))
    return criteria.id === 7 ? 1 : 0
  },
  async findOne(Entity, criteria, options) {
    assert.equal(Entity, Pago)
    queries.push({ criteria: { ...criteria }, options })
    return criteria.id === record.id ? record : null
  },
  assign(entity, input) {
    assignments.push({ ...input })
    Object.assign(entity, input)
  },
  async flush() { flushes++ },
}

before(async () => {
  for (const [target, method] of [[MikroORM, 'init'],
    ...['connect', 'ensureConnection', 'execute'].map(method => [MySqlConnection.prototype, method])]) {
    guards.push(mock.method(target, method, () => { throw new Error('No se permite acceder a MySQL') }))
  }
  for (const method of ['find', 'create', 'remove', 'persist', 'transactional']) {
    em[method] = mock.fn(() => { throw new Error(`Estas pruebas no permiten ${method}`) })
    guards.push(em[method])
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir), 'src/pedido/pago.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, { exports: { orm: { em }, syncSchema: syncGuard } })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ Pago, EstadoPago } = await load('pedido/pago.entity.js'))
  ;({ ServiceError } = await load('shared/service-errors.js'))
  const service = await load('pedido/pago.service.js')
  updatePago = service.updatePago
  serviceMock = mock.module(new URL('pedido/pago.service.js', compiledDir).href, {
    exports: { ...service, updatePago: (...args) => { serviceCalls++; return updatePago(...args) } },
  })
  ;({ createPagoRouter } = await load('pedido/pago.routes.js'))
  ;({ pagoErrorHandler } = await load('pedido/pago.controler.js'))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await load('shared/security/session.js'))
  ;({ getCsrfToken } = await load('shared/security/csrf.js'))
})

beforeEach(() => {
  process.env.SESSION_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-de-pago-1234567890'
  process.env.NODE_ENV = 'test'
  record = { id: 1, estado: 'pending', statusDetail: 'Detalle anterior', monto: 125.5,
    preferenceId: 'preferencia-ficticia', externalReference: 'referencia-ficticia', mercadoPagoPaymentId: 'pago-externo-ficticio',
    fechaCreacion: new Date('2026-10-10T12:00:00Z'), fechaAprobacion: new Date('2026-10-10T13:00:00Z'),
    pedido: { id: 31, estado: 'confirmado', total: 125.5, cliente: { id: 7 }, detallePedido: [{ id: 11, cantidad: 2 }] } }
  assignments = []; flushes = 0; queries = []; serviceCalls = 0
})

after(() => {
  try { for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin MySQL, syncSchema ni otros flujos') }
  finally {
    serviceMock?.restore(); ormMock?.restore()
    for (const guard of guards) guard.mock?.restore?.()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

function assertUnchanged(initial) {
  assert.deepEqual(record, initial)
  assert.deepEqual(assignments, [], 'No asignar siquiera un campo válido cuando otro falla')
  assert.equal(flushes, 0, 'No guardar ni provocar autoflush al rechazar')
}
async function assertRejected(body, message) {
  const initial = structuredClone(record)
  await assert.rejects(() => updatePago(1, body), error => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.statusCode, 400)
    if (message) assert.equal(error.message, message)
    return true
  })
  assertUnchanged(initial)
}
async function assertUpdated(input, expected) {
  const initial = structuredClone(record), originalInput = structuredClone(input), originalPedido = record.pedido
  assert.equal(await updatePago(1, input), record)
  assert.deepEqual(record, { ...initial, ...expected })
  assert.equal(record.pedido, originalPedido, 'No reemplazar la relación ni modificar el pedido')
  assert.deepEqual(input, originalInput, 'No modificar el cuerpo recibido')
  assert.deepEqual(assignments, [expected]); assert.equal(flushes, 1)
}

const states = ['pending', 'approved', 'rejected', 'in_process', 'cancelled']
for (const previous of states) {
  for (const next of states) {
    test(`servicio: conserva transición ${previous} → ${next}, fechas, monto, identificadores y pedido`, async () => {
      assert.deepEqual(Object.values(EstadoPago), states)
      record.estado = previous
      await assertUpdated({ estado: next }, { estado: next })
    })
  }
}
for (const [input, expected] of [['  accredited  ', 'accredited'], ['Texto con  espacios internos', 'Texto con  espacios internos'],
  ['  Aprobación ñ  ', 'Aprobación ñ'], [null, null], ['', null]]) {
  test('servicio: statusDetail ' + JSON.stringify(input) + ' conserva estado y demás campos', async () => {
    await assertUpdated({ statusDetail: input }, { statusDetail: expected })
    if (expected === null) assert.equal(assignments[0].statusDetail, null, 'Borrar con null, no undefined')
  })
}
test('servicio: valida ambos campos sin modificar un cuerpo congelado', async () => {
  await assertUpdated(Object.freeze({ estado: 'approved', statusDetail: '  accredited  ' }), { estado: 'approved', statusDetail: 'accredited' })
})
test('servicio: omitir statusDetail conserva también un valor null', async () => {
  record.statusDetail = null
  await assertUpdated({ estado: 'approved' }, { estado: 'approved' })
})
test('servicio: PUT vacío conserva todos los datos y el flujo existente', async () => {
  await assertUpdated({}, {})
})
test('servicio: cuerpos que no sean objetos dan 400 sin asignar ni guardar', async () => {
  for (const body of [null, undefined, [], ['estado'], 'approved', 1, true]) await assertRejected(body, 'Request body must be an object')
})
test('servicio: estado inválido no modifica un detalle válido aunque aparezca primero en el cuerpo', async () => {
  for (const estado of ['', ' approved', 'approved ', 'APPROVED', 'pendiente', 'unknown', null, undefined,
    0, 1, true, {}, [], { estado: 'approved' }]) {
    await assertRejected({ statusDetail: 'Nuevo detalle', estado }, 'Invalid payment status')
  }
})
test('servicio: statusDetail inválido no modifica un estado válido', async () => {
  for (const statusDetail of [' \t\n ', undefined, 0, 1, true, false, {}, [], { texto: 'Nuevo' }]) {
    await assertRejected({ estado: 'approved', statusDetail }, 'statusDetail must be a non-empty string')
  }
})

for (const [name, extra] of [
  ['ID propio', { id: 1 }], ['otro ID', { id: 2 }], ['pedido como ID', { pedido: 32 }],
  ['pedido anidado', { pedido: { id: 31, cliente: { id: 8 }, estado: 'cancelado' } }],
  ['monto', { monto: 125.5 }], ['preferenceId', { preferenceId: 'otra' }], ['externalReference', { externalReference: 'otra' }],
  ['mercadoPagoPaymentId', { mercadoPagoPaymentId: 'otro' }], ['borrado de mercadoPagoPaymentId', { mercadoPagoPaymentId: null }],
  ['objeto mercadoPagoPaymentId', { mercadoPagoPaymentId: { id: 'otro' } }],
  ['fechaCreacion', { fechaCreacion: '2026-10-10T12:00:00Z' }], ['fechaAprobacion', { fechaAprobacion: null }],
  ['cliente anidado', { cliente: { id: 8 } }], ['colecciones', { detallePedido: [{ id: 11, cantidad: 0 }] }],
  ['campo adicional', { extra: true }], ['propiedad heredada constructor', JSON.parse('{"constructor":{"prototype":{"estado":"approved"}}}')],
  ['__proto__', JSON.parse('{"__proto__":{"estado":"approved"}}')],
]) {
  test('servicio: rechaza ' + name + ' junto con campos válidos sin cambios parciales', async () => {
    await assertRejected({ estado: 'approved', statusDetail: 'Nuevo detalle', ...extra })
  })
}
test('servicio: inexistente conserva 404 incluso con campos prohibidos o cuerpo inválido', async () => {
  const initial = structuredClone(record)
  for (const body of [{}, { estado: 'approved' }, { mercadoPagoPaymentId: 'otro' }, null]) {
    await assert.rejects(() => updatePago(999, body), error => error instanceof ServiceError
      && error.statusCode === 404 && error.message === 'Pago not found')
  }
  assertUnchanged(initial)
})
for (const orderState of ['pendiente', 'confirmado', 'cancelado']) {
  test('compatibilidad: aprobar con pedido ' + orderState + ' no agrega reglas, fechas ni sincronización de monto', async () => {
    record.pedido.estado = orderState
    record.pedido.total = 200 // Inconsistencia preexistente simulada: se deja pendiente su política comercial.
    delete record.fechaAprobacion
    await assertUpdated({ estado: 'approved' }, { estado: 'approved' })
    assert.equal(Object.hasOwn(record, 'fechaAprobacion'), false)
    assert.equal(record.monto, 125.5); assert.equal(record.pedido.total, 200)
  })
}

test('MikroORM sin conexión: borrar statusDetail prepara null para la columna nullable sin tocar relaciones', async t => {
  const entities = []
  for (const [name, path] of [['Admin', 'admin/admin.entity.js'], ['Cliente', 'cliente/cliente.entity.js'],
    ['Pedido', 'pedido/pedido.entity.js'], ['DetallePedido', 'pedido/detallePedido.entity.js'],
    ['MetodoPago', 'pedido/metodoPago.entity.js'], ['MetodoEnvio', 'pedido/metodoEnvio.entity.js'],
    ['Pago', 'pedido/pago.entity.js'], ['Producto', 'producto/producto.entity.js'], ['Categoria', 'categoria/categoria.entity.js']]) {
    entities.push((await import(new URL(path, compiledDir).href))[name])
  }
  const metadataOrm = new MikroORM({ entities, entitiesTs: [], metadataProvider: ReflectMetadataProvider,
    dbName: 'minigo_payment_update_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_payment_update_tests',
    debug: false, metadataCache: { enabled: false }, extensions: [] })
  t.after(() => metadataOrm.close())
  const metadataEm = metadataOrm.em.fork()
  record = metadataEm.create(Pago, { id: 1, pedido: 31, preferenceId: 'preferencia-ficticia', externalReference: 'referencia-ficticia',
    mercadoPagoPaymentId: 'pago-externo-ficticio', estado: EstadoPago.PENDIENTE, monto: 125.5, statusDetail: 'Antes',
    fechaCreacion: new Date('2026-10-10T12:00:00Z') })
  const originalPedido = record.pedido
  t.mock.method(em, 'assign', (entity, input) => { assignments.push({ ...input }); metadataEm.assign(entity, input) })
  await updatePago(1, { statusDetail: '' })
  assert.equal(record.statusDetail, null); assert.equal(record.pedido, originalPedido)
  assert.equal(record.mercadoPagoPaymentId, 'pago-externo-ficticio'); assert.equal(flushes, 1, 'Solo flush simulado')
  metadataEm.persist(record)
  const uow = metadataEm.getUnitOfWork()
  uow.computeChangeSets() // Preparación en memoria; no ejecuta SQL.
  const change = uow.getChangeSets().find(change => change.entity === record)
  assert.equal(change.payload.statusDetail, null); assert.equal(change.payload.pedido, 31)
})

async function harness(t) {
  const store = new session.MemoryStore(), app = express()
  app.use(express.json()); app.use('/api', createSessionMiddleware(store))
  // Identidades ficticias solo en el servidor de prueba, con cookies firmadas y CSRF reales.
  app.get('/api/test-session/:tipo', async (req, res) => {
    if (req.params.tipo !== 'anonimo') {
      req.session.identity = { id: 7, tipo: req.params.tipo }; req.session.authenticatedAt = Date.now()
    }
    res.json({ csrfToken: await getCsrfToken(req) })
  })
  app.use('/api/pagos', createPagoRouter({ allowedOrigins: [origin] }), pagoErrorHandler)
  const server = createServer(app)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const call = (path, { method = 'GET', cookie, token, sourceOrigin, body } = {}) => new Promise((resolve, reject) => {
    const headers = {}
    if (cookie) headers.Cookie = cookie
    if (token) headers['X-CSRF-Token'] = token
    if (sourceOrigin) headers.Origin = sourceOrigin
    const payload = body === undefined ? undefined : JSON.stringify(body)
    if (payload !== undefined) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload) }
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject); req.end(payload)
  })
  const fixture = async tipo => {
    const response = await call('/api/test-session/' + tipo)
    const cookie = response.headers['set-cookie'].find(value => value.startsWith('minigo.sid=')).split(';')[0]
    const signed = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    return { cookie, token: response.body.csrfToken, sid: signed.slice(2, signed.lastIndexOf('.')), sourceOrigin: origin }
  }
  const put = (current, body, id = 1) => call(`/api/pagos/${id}`, { ...current, method: 'PUT', body })
  return { store, fixture, put }
}

test('HTTP: Admin con CSRF conserva respuestas, parciales y borrado de statusDetail', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin')
  for (const [body, expected] of [[{ estado: 'approved' }, { estado: 'approved' }],
    [{ statusDetail: '  accredited  ' }, { statusDetail: 'accredited' }], [{ statusDetail: null }, { statusDetail: null }],
    [{ statusDetail: 'Nuevo' }, { statusDetail: 'Nuevo' }], [{ statusDetail: '' }, { statusDetail: null }], [{}, {}]]) {
    const initial = structuredClone(record), response = await put(current, body)
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: 'pago updated', data: JSON.parse(JSON.stringify({ ...initial, ...expected })) })
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal(serviceCalls, 6); assert.equal(flushes, 6)
})
test('HTTP: conserva las 25 transiciones sin modificar pedido, fechas, monto o identificadores', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin')
  for (const previous of states) {
    for (const next of states) {
      record.estado = previous
      const initial = structuredClone(record), response = await put(current, { estado: next })
      assert.equal(response.status, 200)
      assert.deepEqual(record, { ...initial, estado: next })
    }
  }
  assert.equal(serviceCalls, 25); assert.equal(flushes, 25)
})
test('HTTP: datos inválidos y campos adicionales dan 400 sin cambios ni escrituras', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = structuredClone(record)
  for (const body of [null, [], { estado: 'APPROVED' }, { estado: ' approved ' }, { estado: null },
    { statusDetail: ' ' }, { estado: 'approved', statusDetail: { texto: 'Nuevo' } }, { estado: 'approved', statusDetail: 1 },
    { estado: 'approved', id: 1 }, { pedido: { id: 32, cliente: { id: 8 } } }, { monto: 0 }, { preferenceId: 'otra' },
    { externalReference: 'otra' }, { mercadoPagoPaymentId: 'otro' }, { mercadoPagoPaymentId: null },
    { fechaCreacion: '2026-10-10T12:00:00Z' }, { fechaAprobacion: null }, { detallePedido: [] }, { extra: true }]) {
    const response = await put(current, body)
    assert.equal(response.status, 400); assert.deepEqual(Object.keys(response.body), ['message']); assertUnchanged(initial)
  }
})
for (const [actor, expected] of [['sin sesion', 401], ['anonimo', 401], ['cliente', 403]]) {
  test('HTTP: ' + actor + ' recibe ' + expected + ' antes de llamar al servicio', async t => {
    const { fixture, put } = await harness(t), current = actor === 'sin sesion' ? {} : await fixture(actor), initial = structuredClone(record)
    assert.equal((await put(current, { estado: 'approved', statusDetail: 'Nuevo' })).status, expected)
    assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
  })
}
test('HTTP: sesión Admin vencida da 401 antes del servicio', async t => {
  const { store, fixture, put } = await harness(t), current = await fixture('admin'), initial = structuredClone(record)
  const stored = await new Promise((resolve, reject) => store.get(current.sid, (error, value) => error ? reject(error) : resolve(value)))
  stored.authenticatedAt = Date.now() - SESSION_TTL_MS - 1; stored.cookie.expires = new Date(Date.now() + SESSION_TTL_MS)
  await new Promise((resolve, reject) => store.set(current.sid, stored, error => error ? reject(error) : resolve()))
  assert.equal((await put(current, { estado: 'approved' })).status, 401)
  assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
})
test('HTTP: CSRF ausente, alterado, de otra sesión y origen inválido rechazan antes del servicio', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), other = await fixture('admin'), initial = structuredClone(record)
  const altered = (current.token[0] === 'a' ? 'b' : 'a') + current.token.slice(1)
  for (const overrides of [{ token: undefined }, { token: altered }, { token: other.token },
    { sourceOrigin: undefined }, { sourceOrigin: 'https://evil.example' }]) {
    const response = await put({ ...current, ...overrides }, { estado: 'approved', statusDetail: 'Nuevo' })
    assert.equal(response.status, 403); assert.equal(response.body.message, 'Solicitud CSRF inválida')
    assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
  }
})
test('HTTP: pago inexistente conserva 404 y formato de error', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = structuredClone(record)
  const response = await put(current, { estado: 'approved' }, 999)
  assert.equal(response.status, 404); assert.deepEqual(response.body, { message: 'Pago not found' }); assertUnchanged(initial)
})
test('HTTP: fallo del ORM da 500 genérico sin SQL, hashes, cookies, secretos o rutas internas', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = structuredClone(record)
  t.mock.method(em, 'findOne', () => { throw new TypeError(internalDetail) })
  const response = await put(current, { estado: 'approved' })
  assert.equal(response.status, 500); assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud de pagos' })
  assertUnchanged(initial)
})
