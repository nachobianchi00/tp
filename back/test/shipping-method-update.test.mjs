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

// Desde back/: node --experimental-test-module-mocks --test test/shipping-method-update.test.mjs
// Servicio y router reales con ORM simulado. No se importa index.ts ni se conecta MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-shipping-method-update-tests/', import.meta.url)
const origin = 'https://minigo.example'
const internalDetail = 'SELECT password FROM cliente; secreto-ficticio; C:\\servidor\\orm.ts:15'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, serviceMock, MetodoEnvio, ServiceError, updateMetodoEnvio
let createMetodoEnvioRouter, metodoEnvioAccessErrorHandler, createSessionMiddleware, getCsrfToken, SESSION_TTL_MS
let record, assignments, flushes, queries, serviceCalls

// Un único registro y su relación simulados. La asignación permite cualquier clave:
// las restricciones deben cumplirse en el servicio real, antes de llegar a este doble.
const em = {
  async findOne(Entity, criteria) {
    assert.equal(Entity, MetodoEnvio)
    queries.push({ ...criteria })
    return criteria.id === record.id ? record : null
  },
  assign(entity, input) {
    assignments.push({ ...input })
    Object.assign(entity, input)
  },
  async flush() { flushes++ },
}

before(async () => {
  for (const [target, method] of [
    [MikroORM, 'init'],
    ...['connect', 'ensureConnection', 'execute'].map(method => [MySqlConnection.prototype, method]),
  ]) guards.push(mock.method(target, method, () => { throw new Error('No se permite acceder a MySQL') }))
  for (const method of ['find', 'create', 'remove', 'persist', 'transactional']) {
    em[method] = mock.fn(() => { throw new Error(`Estas pruebas no permiten ${method}`) })
    guards.push(em[method])
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir),
    'src/pedido/metodoEnvio.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ MetodoEnvio } = await load('pedido/metodoEnvio.entity.js'))
  ;({ ServiceError } = await load('shared/service-errors.js'))
  const service = await load('pedido/metodoEnvio.service.js')
  updateMetodoEnvio = service.updateMetodoEnvio
  serviceMock = mock.module(new URL('pedido/metodoEnvio.service.js', compiledDir).href, {
    exports: { ...service, updateMetodoEnvio: (...args) => {
      serviceCalls++
      return updateMetodoEnvio(...args)
    } },
  })
  ;({ createMetodoEnvioRouter, metodoEnvioAccessErrorHandler } = await load('pedido/metodoEnvio.routes.js'))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await load('shared/security/session.js'))
  ;({ getCsrfToken } = await load('shared/security/csrf.js'))
})

beforeEach(() => {
  process.env.SESSION_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-metodo-envio-1234567890'
  process.env.NODE_ENV = 'test'
  record = { id: 1, descripcion: 'Envío', costo: 10.5, requiereDireccion: false, estado: false,
    tiempoEstimado: '24 horas', observacion: 'Observación inicial', pedidos: [{ id: 11, cliente: { id: 7 }, total: 100 }] }
  assignments = []; flushes = 0; queries = []; serviceCalls = 0
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin MySQL, syncSchema ni otros flujos')
  } finally {
    serviceMock?.restore()
    ormMock?.restore()
    for (const guard of guards) guard.mock?.restore?.()
    for (const [key, value] of [['SESSION_SECRET', originalEnv.secret], ['NODE_ENV', originalEnv.nodeEnv]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

function assertUnchanged(initial) {
  assert.deepEqual(record, initial)
  assert.deepEqual(assignments, [], 'No debe asignarse ni un campo válido si otro es inválido')
  assert.equal(flushes, 0, 'El rechazo debe ocurrir antes de guardar')
}

async function assertRejected(body, message) {
  const initial = structuredClone(record)
  await assert.rejects(() => updateMetodoEnvio(1, body), error => {
    assert.ok(error instanceof ServiceError)
    assert.equal(error.statusCode, 400)
    if (message) assert.equal(error.message, message)
    return true
  })
  assertUnchanged(initial)
}

const validFields = {
  descripcion: 'Nueva descripcion', costo: 20, requiereDireccion: true, estado: true,
  tiempoEstimado: '48 horas', observacion: 'Nueva observacion',
}

async function assertUpdated(input, expected) {
  const initial = structuredClone(record), originalInput = structuredClone(input)
  assert.equal(await updateMetodoEnvio(1, input), record)
  assert.deepEqual(record, { ...initial, ...expected })
  assert.deepEqual(input, originalInput, 'El servicio no modifica el cuerpo recibido')
  assert.deepEqual(assignments, [expected])
  assert.equal(flushes, 1)
}

for (const [input, expected] of [['  Envío rápido  ', 'Envío rápido'],
  ['Envío con  dos espacios', 'Envío con  dos espacios'], ['  Retiro ñ  ', 'Retiro ñ']]) {
  test('servicio: descripcion válida "' + input + '" conserva los otros cinco campos y relaciones', async () => {
    await assertUpdated({ descripcion: input }, { descripcion: expected })
  })
}

for (const [input, expected] of [[0, 0], [12.345, 12.35], [12.344, 12.34],
  [99_999_999.99, 99_999_999.99], [99_999_999.994, 99_999_999.99]]) {
  test('servicio: costo ' + input + ' respeta el redondeo y el límite del POST', async () => {
    await assertUpdated({ costo: input }, { costo: expected })
  })
}

for (const field of ['requiereDireccion', 'estado']) {
  for (const value of [true, false]) {
    test('servicio: ' + field + ' acepta ' + value + ' sin restablecer otros campos', async () => {
      record[field] = !value
      await assertUpdated({ [field]: value }, { [field]: value })
    })
  }
}

for (const field of ['tiempoEstimado', 'observacion']) {
  for (const [input, expected] of [['  Texto ñ con  espacios  ', 'Texto ñ con  espacios'], [null, null], ['', null]]) {
    test('servicio: ' + field + ' procesa ' + JSON.stringify(input) + ' y conserva el otro texto', async () => {
      await assertUpdated({ [field]: input }, { [field]: expected })
      if (expected === null) {
        assert.ok(Object.hasOwn(assignments[0], field))
        assert.equal(assignments[0][field], null, 'Borrar debe asignar null explícito, no undefined')
      }
    })
  }
}

test('servicio: los seis campos se validan sin modificar el cuerpo recibido', async () => {
  const input = Object.freeze({ descripcion: '  Tarjeta  ', costo: 12.345, requiereDireccion: true,
    estado: true, tiempoEstimado: '  Mañana  ', observacion: '' })
  await assertUpdated(input, { descripcion: 'Tarjeta', costo: 12.35, requiereDireccion: true,
    estado: true, tiempoEstimado: 'Mañana', observacion: null })
})

test('servicio: PUT vacío conserva todos los datos y el flujo existente', async () => {
  await assertUpdated({}, {})
})

test('servicio: cuerpos que no son objetos se rechazan sin asignar ni guardar', async () => {
  for (const input of [null, undefined, [], ['descripcion'], 'Envío', 1, true]) {
    await assertRejected(input, 'Request body must be an object')
  }
})

test('servicio: descripcion inválida no modifica tampoco otros campos válidos', async () => {
  for (const descripcion of ['', '  \t\n ', null, undefined, 1, true, {}, [], { texto: 'Envío' }]) {
    await assertRejected({ ...validFields, descripcion }, 'descripcion must be a non-empty string')
  }
})

test('servicio: costo inválido y valores fuera del límite no producen cambios parciales', async () => {
  for (const costo of [-1, -0.001, '10', null, undefined, NaN, Infinity, -Infinity, {}, [], true,
    100_000_000, 99_999_999.996, Number.MAX_VALUE]) {
    await assertRejected({ ...validFields, costo })
  }
})

for (const field of ['requiereDireccion', 'estado']) {
  test('servicio: ' + field + ' rechaza valores que no sean booleanos antes de cualquier asignación', async () => {
    for (const value of ['false', 'true', '', 0, 1, null, undefined, {}, [], { valor: false }]) {
      await assertRejected({ ...validFields, [field]: value }, field + ' must be a boolean')
    }
  })
}

for (const field of ['tiempoEstimado', 'observacion']) {
  test('servicio: ' + field + ' rechaza espacios y tipos inválidos sin cambiar campos válidos', async () => {
    for (const value of ['  \t\n ', undefined, 1, true, {}, [], { texto: 'Nuevo' }]) {
      await assertRejected({ ...validFields, [field]: value }, field + ' must be a non-empty string')
    }
  })
}

for (const [name, input] of [
  ['ID igual a la URL', { id: 1 }], ['ID distinto a la URL', { id: 2 }],
  ['pedidos vacíos', { pedidos: [] }], ['IDs de pedidos', { pedidos: [11, 12] }],
  ['pedidos y cliente anidados', { pedidos: [{ id: 11, cliente: { id: 8 }, total: 0 }] }],
  ['cliente anidado', { cliente: { id: 8 } }], ['nombre price', { price: 0 }], ['campo adicional', { extra: true }],
  ['constructor', JSON.parse('{"constructor":{"prototype":{"estado":true}}}')],
  ['__proto__', JSON.parse('{"__proto__":{"estado":true}}')],
]) {
  test('servicio: rechaza ' + name + ' junto con campos válidos sin cambios parciales', async () => {
    await assertRejected({ ...validFields, ...input }, 'Request body contains fields that cannot be updated')
  })
}

test('servicio: un recurso inexistente conserva 404 antes de asignar o guardar', async () => {
  const initial = structuredClone(record)
  for (const input of [validFields, {}, { id: 999 }, null]) {
    await assert.rejects(() => updateMetodoEnvio(999, input), error =>
      error.statusCode === 404 && error.message === 'Metodo de envio not found')
  }
  assertUnchanged(initial)
})

test('MikroORM real sin conexión: el borrado prepara null para ambas columnas nullable', async t => {
  // El constructor solo descubre metadata; init, conexiones y consultas están bloqueados.
  const entities = []
  for (const [name, path] of [
    ['Admin', 'admin/admin.entity.js'], ['Cliente', 'cliente/cliente.entity.js'],
    ['Pedido', 'pedido/pedido.entity.js'], ['DetallePedido', 'pedido/detallePedido.entity.js'],
    ['MetodoPago', 'pedido/metodoPago.entity.js'], ['MetodoEnvio', 'pedido/metodoEnvio.entity.js'],
    ['Pago', 'pedido/pago.entity.js'], ['Producto', 'producto/producto.entity.js'], ['Categoria', 'categoria/categoria.entity.js'],
  ]) entities.push((await import(new URL(path, compiledDir).href))[name])
  const metadataOrm = new MikroORM({
    entities, entitiesTs: [], metadataProvider: ReflectMetadataProvider,
    dbName: 'minigo_shipping_update_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_shipping_update_tests',
    debug: false, metadataCache: { enabled: false }, extensions: [],
  })
  t.after(() => metadataOrm.close())
  const metadataEm = metadataOrm.em.fork()
  record = metadataEm.create(MetodoEnvio, {
    id: 1, descripcion: 'Envío', costo: 10, requiereDireccion: true, estado: true,
    tiempoEstimado: 'Mañana', observacion: 'Texto anterior',
  })
  t.mock.method(em, 'assign', (entity, input) => {
    assignments.push({ ...input })
    metadataEm.assign(entity, input)
  })
  await updateMetodoEnvio(1, { tiempoEstimado: null, observacion: '' })
  assert.equal(record.tiempoEstimado, null)
  assert.equal(record.observacion, null)
  assert.equal(flushes, 1, 'Solo se invoca el flush simulado')
  metadataEm.persist(record)
  const uow = metadataEm.getUnitOfWork()
  uow.computeChangeSets() // Preparación de datos en memoria; no se ejecuta SQL.
  const changes = uow.getChangeSets().find(change => change.entity === record)
  assert.ok(changes)
  assert.equal(changes.payload.tiempoEstimado, null)
  assert.equal(changes.payload.observacion, null)
})

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  app.use('/api', createSessionMiddleware(store))
  // Preparación exclusiva del servidor de prueba: identidades simuladas, cookies
  // firmadas por express-session y tokens reales. No se agregan endpoints al backend.
  app.get('/api/test-session/:tipo', async (req, res) => {
    if (req.params.tipo !== 'anonimo') {
      req.session.identity = { id: 7, tipo: req.params.tipo }
      req.session.authenticatedAt = Date.now()
    }
    res.json({ csrfToken: await getCsrfToken(req) })
  })
  app.use('/api/metodos-envio', createMetodoEnvioRouter({ allowedOrigins: [origin] }), metodoEnvioAccessErrorHandler)
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const call = (path, { method = 'GET', cookie, token, sourceOrigin, body } = {}) => new Promise((resolve, reject) => {
    const headers = {}
    if (cookie) headers.Cookie = cookie
    if (token) headers['X-CSRF-Token'] = token
    if (sourceOrigin) headers.Origin = sourceOrigin
    const payload = body === undefined ? undefined : JSON.stringify(body)
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
  const fixture = async tipo => {
    const response = await call(`/api/test-session/${tipo}`)
    assert.equal(response.status, 200)
    const cookie = response.headers['set-cookie'].find(value => value.startsWith('minigo.sid=')).split(';')[0]
    const signed = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
    return { cookie, token: response.body.csrfToken, sid: signed.slice(2, signed.lastIndexOf('.')), sourceOrigin: origin }
  }
  const put = (current, body, id = 1) => call(`/api/metodos-envio/${id}`, { ...current, method: 'PUT', body })
  return { store, call, fixture, put }
}

test('HTTP: admin y CSRF válidos conservan los seis campos, parciales, ceros, false y borrado', async t => {
  const { fixture, put } = await harness(t)
  const current = await fixture('admin')
  const cases = [
    [{ descripcion: '  Nueva  ' }, { descripcion: 'Nueva' }],
    [{ costo: 0 }, { costo: 0 }],
    [{ costo: 12.345 }, { costo: 12.35 }],
    [{ requiereDireccion: true, estado: true }, { requiereDireccion: true, estado: true }],
    [{ requiereDireccion: false, estado: false }, { requiereDireccion: false, estado: false }],
    [{ tiempoEstimado: '  Mañana  ' }, { tiempoEstimado: 'Mañana' }],
    [{ observacion: '  Retiro  ' }, { observacion: 'Retiro' }],
    [{ tiempoEstimado: null }, { tiempoEstimado: null }],
    [{ observacion: '' }, { observacion: null }],
    [{ tiempoEstimado: '', observacion: null }, { tiempoEstimado: null, observacion: null }],
    [{}, {}],
  ]
  for (const [body, expected] of cases) {
    const initial = structuredClone(record)
    const response = await put(current, body)
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: 'metodo de envio updated', data: { ...initial, ...expected } })
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal(serviceCalls, cases.length)
  assert.equal(flushes, cases.length)
})

test('HTTP: campos inválidos, adicionales y relaciones devuelven 400 sin asignaciones', async t => {
  const { fixture, put } = await harness(t)
  const current = await fixture('admin'), initial = structuredClone(record)
  for (const body of [null, [], { descripcion: ' ' }, { descripcion: { valor: 'Nueva' } },
    { ...validFields, costo: -1 }, { ...validFields, costo: '10' }, { ...validFields, costo: null },
    { ...validFields, costo: 100_000_000 }, { ...validFields, requiereDireccion: 'false' },
    { ...validFields, estado: 0 }, { ...validFields, estado: null },
    { ...validFields, tiempoEstimado: '  ' }, { ...validFields, observacion: { texto: 'Nueva' } },
    { ...validFields, id: 1 }, { pedidos: [{ id: 11, cliente: { id: 8 } }] }, { price: 0 }, { extra: true }]) {
    const response = await put(current, body)
    assert.equal(response.status, 400)
    assert.deepEqual(Object.keys(response.body), ['message'])
    assertUnchanged(initial)
  }
})

for (const [actor, expected] of [['sin sesion', 401], ['anonimo', 401], ['cliente', 403]]) {
  test(`HTTP: ${actor} recibe ${expected} antes de llamar al servicio`, async t => {
    const { fixture, put } = await harness(t)
    const current = actor === 'sin sesion' ? {} : await fixture(actor)
    const initial = structuredClone(record)
    const response = await put(current, { descripcion: 'Nueva', estado: true })
    assert.equal(response.status, expected)
    assert.equal(serviceCalls, 0)
    assert.deepEqual(queries, [])
    assertUnchanged(initial)
  })
}

test('HTTP: sesión admin vencida recibe 401 aunque el almacén conserve el registro', async t => {
  const { store, fixture, put } = await harness(t)
  const current = await fixture('admin'), initial = structuredClone(record)
  const stored = await new Promise((resolve, reject) => store.get(current.sid, (error, value) => error ? reject(error) : resolve(value)))
  stored.authenticatedAt = Date.now() - SESSION_TTL_MS - 1
  stored.cookie.expires = new Date(Date.now() + SESSION_TTL_MS)
  await new Promise((resolve, reject) => store.set(current.sid, stored, error => error ? reject(error) : resolve()))
  assert.equal((await put(current, { estado: true })).status, 401)
  assert.equal(serviceCalls, 0)
  assert.deepEqual(queries, [])
  assertUnchanged(initial)
})

test('HTTP: CSRF ausente, manipulado, de otra sesión y origen inválido rechazan antes del servicio', async t => {
  const { fixture, put } = await harness(t)
  const current = await fixture('admin'), other = await fixture('admin'), initial = structuredClone(record)
  const altered = (current.token[0] === 'a' ? 'b' : 'a') + current.token.slice(1)
  for (const overrides of [{ token: undefined }, { token: altered }, { token: other.token },
    { sourceOrigin: undefined }, { sourceOrigin: 'https://evil.example' }]) {
    const response = await put({ ...current, ...overrides }, { descripcion: 'Nueva', estado: true })
    assert.equal(response.status, 403)
    assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
    assert.equal(serviceCalls, 0)
    assert.deepEqual(queries, [])
    assertUnchanged(initial)
  }
})

test('HTTP: recurso inexistente conserva 404 y el formato de error', async t => {
  const { fixture, put } = await harness(t)
  const current = await fixture('admin'), initial = structuredClone(record)
  const response = await put(current, { estado: true }, 999)
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { message: 'Metodo de envio not found' })
  assertUnchanged(initial)
})

test('HTTP: un fallo inesperado del ORM devuelve 500 genérico sin detalles internos', async t => {
  const { fixture, put } = await harness(t)
  const current = await fixture('admin'), initial = structuredClone(record)
  t.mock.method(em, 'findOne', () => { throw new TypeError(internalDetail) })
  const response = await put(current, { descripcion: 'Nueva' })
  assert.equal(response.status, 500)
  assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud' })
  assertUnchanged(initial)
})

