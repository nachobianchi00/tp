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
import { hashPassword } from '../src/shared/security/password.ts'

// Desde back/, Node 24: node --experimental-test-module-mocks --test test/commercial-method-access.test.mjs
// Router, controladores y servicios reales; cuentas simuladas, sin index.ts ni conexiones a MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-commercial-method-access-tests/', import.meta.url)
const origin = 'https://minigo.example'
const password = '  Contraseña ficticia de administradores 123!  '
const testSecret = 'secreto-ficticio-exclusivo-de-pruebas-de-admin-1234567890'
const internalDetail = 'detalle-interno-ficticio-del-almacen'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, metadataOrm, entities, storedHash, records, writes, queries
let createMetodoPagoRouter, metodoPagoAccessErrorHandler, createMetodoEnvioRouter, metodoEnvioAccessErrorHandler, createAuthRouter, authErrorHandler
let serviceCalls, serviceMocks = []
let createSessionMiddleware, SESSION_TTL_MS

function matches(record, Entity, criteria) {
  return record instanceof Entity && Object.entries(criteria).every(([key,value]) =>
    value && typeof value === 'object' && '$in' in value ? value.$in.includes(record[key]) : record[key] === value)
}
// Almacenamiento simulado de cuentas y métodos; metadataOrm solo prepara la serialización real.
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
    assert.ok(Entity === entities.MetodoPago || Entity === entities.MetodoEnvio);
    const account = Object.assign(new Entity(), input, { id: Math.max(...records.map(record => record.id), 0) + 1 })
    records.push(account)
    writes.created++
    return account
  },
  assign(account, input) {
    writes.assigned++
    Object.assign(account, input)
  },
  remove(record) {
    assert.ok(record instanceof entities.MetodoPago || record instanceof entities.MetodoEnvio);
    records.splice(records.indexOf(record),1);writes.removed++;
  },
  async flush() { writes.flushed++ },
}
for (const method of ['persist', 'transactional']) {
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
    'src/pedido/metodoPago.routes.ts', 'src/pedido/metodoEnvio.routes.ts', 'src/auth/auth.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { em }, syncSchema: syncGuard },
  })
  const load = path => import(new URL(path, compiledDir).href)
  // Los servicios reales siguen ejecutándose; los espías prueban que un rechazo no los llama.
  for (const path of ['pedido/metodoPago.service.js','pedido/metodoEnvio.service.js']) {
    const real = await load(path);
    const exports = Object.fromEntries(Object.entries(real).map(([name,fn]) => [name,mock.fn((...args) => {
      serviceCalls[name] = (serviceCalls[name] ?? 0) + 1;
      return fn(...args);
    })]));
    serviceMocks.push(mock.module(new URL(path,compiledDir).href,{exports}));
  }
  ;({ createMetodoPagoRouter, metodoPagoAccessErrorHandler } = await load('pedido/metodoPago.routes.js'))
  ;({ createMetodoEnvioRouter, metodoEnvioAccessErrorHandler } = await load('pedido/metodoEnvio.routes.js'))
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
    dbName: 'minigo_commercial_method_access_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_commercial_method_access_tests',
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
  const paymentMethods = [1,2].map(id => Object.assign(new entities.MetodoPago(),{
    id,descripcion:'Metodo de pago '+id,estado:id === 1}));
  const shippingMethods = [1,2].map(id => Object.assign(new entities.MetodoEnvio(),{
    id,descripcion:'Metodo de envio '+id,costo:55.25,requiereDireccion:true,
    tiempoEstimado:'2 dias',estado:id === 1,observacion:'Prueba ficticia'}));
  records.push(...paymentMethods,...shippingMethods);
  serviceCalls = {};
  writes = { created: 0, assigned: 0, removed: 0, flushed: 0 }
  queries = []
})

after(async () => {
  try {
    await metadataOrm?.close()
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin MySQL, syncSchema ni eliminación de cuentas')
  } finally {
    for (const serviceMock of serviceMocks) serviceMock.restore();
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

function assertSafe(response, noStore = false) {
  assert.match(response.headers['content-type'], /application\/json/)
  if (noStore) assert.equal(response.headers['cache-control'], 'no-store')
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
  return { records: records.map(record => ({ ...record })), writes: { ...writes }, queries: queries.length,
    calls: {...serviceCalls}, collections: records.flatMap(record => Object.values(record)
      .filter(value => value && typeof value.getItems === 'function')
      .map(collection => ({collection,ids:collection.getItems().map(item=>item.id)}))) }
}
function assertUntouched(before) {
  assert.deepEqual(records.map(record => ({ ...record })), before.records)
  assert.deepEqual(writes, before.writes)
  assert.deepEqual(serviceCalls,before.calls,'El rechazo debe ocurrir antes de llamar al servicio');
  assert.deepEqual(snapshot().collections,before.collections);
  assert.equal(queries.length, before.queries, 'Una petición sin permisos no llega a los servicios del CRUD')
}

async function harness(t) {
  const store = new session.MemoryStore()
  const app = express()
  app.use(express.json())
  // Mismo montaje que index.ts; solo Express aislado, ningún arranque real.
  app.use('/api', createSessionMiddleware(store))
  app.use('/api/auth', createAuthRouter({ allowedOrigins: [origin] }), authErrorHandler)
  app.use('/api/metodos-pago', createMetodoPagoRouter({ allowedOrigins: [origin] }), metodoPagoAccessErrorHandler)
  app.use('/api/metodos-envio', createMetodoEnvioRouter({ allowedOrigins: [origin] }), metodoEnvioAccessErrorHandler)
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

const modules = [
  { path:'/api/metodos-pago',singular:'metodo de pago',plural:'metodos de pago',entity:'MetodoPago',
    notFound:'Metodo de pago not found',listService:'findAllMetodosPago',getService:'findMetodoPago',
    createService:'createMetodoPago',updateService:'updateMetodoPago',deleteService:'deleteMetodoPago',
    create:{descripcion:'  Metodo de pago nuevo  '} },
  { path:'/api/metodos-envio',singular:'metodo de envio',plural:'metodos de envio',entity:'MetodoEnvio',
    notFound:'Metodo de envio not found',listService:'findAllMetodosEnvio',getService:'findMetodoEnvio',
    createService:'createMetodoEnvio',updateService:'updateMetodoEnvio',deleteService:'deleteMetodoEnvio',
    create:{descripcion:'  Metodo de envio nuevo  ',costo:12.345} },
]
const storedMethods = module => records.filter(record => record instanceof entities[module.entity])
const pathFor = (module, method, id = 1) => method === 'POST' ? module.path : `${module.path}/${id}`
const bodyFor = (module, method) => method === 'POST' ? module.create : method === 'PUT' ? { descripcion: 'Actualizado' } : undefined
function assertNoWrites(before) {
  assert.deepEqual(records.map(record => ({ ...record })), before.records)
  assert.deepEqual(writes, before.writes)
  assert.deepEqual(snapshot().collections, before.collections)
}

for (const module of modules) {
  for (const actor of ['sin sesión', 'anónimo', 'cliente', 'admin']) {
    test(`${module.plural}: GET público para ${actor}, sin CSRF y con visibilidad actual`, async t => {
      const { call, bootstrap, authenticate } = await harness(t)
      const current = actor === 'sin sesión' ? undefined : actor === 'anónimo' ? await bootstrap() : await authenticate(actor)
      const before = snapshot()
      const list = await call(module.path, { cookie: current?.cookie.pair })
      assert.equal(list.status, 200)
      assert.equal(list.body.message, `found all ${module.plural}`)
      assert.deepEqual(list.body.data.map(record => record.id), [1, 2])
      assert.equal(serviceCalls[module.listService], 1, 'Se ejecuta el servicio real observado por el espía')
      assertSafe(list)
      if (actor === 'sin sesión') assert.equal(list.headers['set-cookie'], undefined, 'Consultar no crea una sesión')
      assert.equal(list.body.data.find(record => record.id === 2).estado, false)
      for (const id of [1, 2]) {
        const one = await call(`${module.path}/${id}`, { cookie: current?.cookie.pair })
        assert.equal(one.status, 200)
        assert.deepEqual(one.body, { message: `found ${module.singular}`, data: list.body.data.find(record => record.id === id) })
        assertSafe(one)
      }
      assertNoWrites(before)
    })
  }

  test(`${module.plural}: GET inexistente o con ID inválido conserva 404 y 400 públicos`, async t => {
    const { call } = await harness(t)
    const before = snapshot()
    const missing = await call(`${module.path}/999`)
    assert.equal(missing.status, 404)
    assert.deepEqual(missing.body, { message: `${module.notFound}` })
    assert.equal((await call(`${module.path}/invalido`)).status, 400)
    assertNoWrites(before)
  })

  for (const actor of ['sin sesión', 'anónimo', 'cliente']) {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      test(`${module.plural}: ${method} rechaza ${actor} antes del servicio y de las escrituras`, async t => {
        const { call, bootstrap, authenticate } = await harness(t)
        const current = actor === 'sin sesión' ? undefined : actor === 'anónimo' ? await bootstrap() : await authenticate('cliente')
        const before = snapshot()
        const response = await call(`${pathFor(module, method)}?tipo=admin`, { method,
          cookie: current?.cookie.pair, token: current?.token, sourceOrigin: origin,
          body: method === 'DELETE' ? undefined : { ...bodyFor(module, method), identity: { id: 7, tipo: 'admin' } } })
        assert.equal(response.status, actor === 'cliente' ? 403 : 401)
        assert.deepEqual(response.body, { message: actor === 'cliente' ? 'Acceso no autorizado' : 'No autenticado' })
        assertSafe(response, true)
        assertUntouched(before)
      })
    }
  }

  test(`${module.plural}: Admin crea registros con CSRF y conserva la validación del servicio`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const response = await call(module.path, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body: module.create })
    assert.equal(response.status, 201)
    assert.equal(response.body.message, `${module.singular} created`)
    assert.equal(response.body.data.descripcion, module.create.descripcion.trim())
    assert.equal(serviceCalls[module.createService], 1)
    assert.equal(storedMethods(module).length, 3)
    assert.equal(response.body.data.estado,true);
    if (module.entity === 'MetodoEnvio') {
      assert.equal(response.body.data.costo,12.35);
      assert.equal(response.body.data.requiereDireccion,true);
      assert.equal(response.body.data.tiempoEstimado,undefined);
      assert.equal(response.body.data.observacion,undefined);
    }
    assert.deepEqual(writes, { created: 1, assigned: 0, removed: 0, flushed: 1 })
    assertSafe(response, true)
  })

  test(`${module.plural}: Admin conserva PUT parcial y PUT vacío con CSRF`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const record = storedMethods(module)[0]
    const initial = { ...record }
    const response = await call(`${module.path}/1`, { method: 'PUT', cookie: cookie.pair, token,
      sourceOrigin: origin, body: { descripcion: 'Actualizado' } })
    assert.equal(response.status, 200)
    assert.equal(response.body.message, `${module.singular} updated`)
    assert.equal(record.descripcion, 'Actualizado')
    for (const key of Object.keys(initial).filter(key => key !== 'descripcion')) assert.equal(record[key], initial[key])
    assert.equal(serviceCalls[module.updateService], 1)
    assertSafe(response, true)
    const empty = await call(`${module.path}/1`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body: {} })
    assert.equal(empty.status, 200)
    assert.deepEqual(writes, { created: 0, assigned: 2, removed: 0, flushed: 2 })
  })

  test(`${module.plural}: Admin conserva DELETE con CSRF y respuesta habitual`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const response = await call(`${module.path}/2`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: `${module.singular} deleted` })
    assert.equal(serviceCalls[module.deleteService], 1)
    assert.equal(storedMethods(module).some(record => record.id === 2), false)
    assert.deepEqual(writes, { created: 0, assigned: 0, removed: 1, flushed: 1 })
    assertSafe(response, true)
  })

  for (const method of ['POST', 'PUT', 'DELETE']) {
    test(`${module.plural}: ${method} exige CSRF de la sesión y origen permitido antes del CRUD`, async t => {
      const { call, bootstrap, authenticate } = await harness(t)
      const current = await authenticate()
      const other = await bootstrap()
      const altered = (current.token[0] === 'a' ? 'b' : 'a') + current.token.slice(1)
      for (const [token, sourceOrigin] of [[undefined, origin], [altered, origin], [other.token, origin],
        [current.anonymous.token, origin], [current.token, undefined], [current.token, 'null'],
        [current.token, 'https://evil.example']]) {
        const before = snapshot()
        const response = await call(pathFor(module, method), { method, cookie: current.cookie.pair, token,
          sourceOrigin, referer: sourceOrigin === 'https://evil.example' ? `${origin}/catalogo` : undefined,
          body: bodyFor(module, method) })
        assert.equal(response.status, 403)
        assert.deepEqual(response.body, { message: 'Solicitud CSRF inválida' })
        assertSafe(response, true)
        assertUntouched(before)
      }
      const allowed = await call(pathFor(module, method), { method, cookie: current.cookie.pair, token: current.token,
        referer: `${origin}/catalogo`, body: bodyFor(module, method) })
      assert.equal(allowed.status, method === 'POST' ? 201 : 200)
    })
  }

  for (const tipo of ['admin', 'cliente']) {
    test(`${module.plural}: sesión ${tipo} vencida permite GET público y rechaza escrituras`, async t => {
      const start = Date.parse('2026-10-10T12:00:00Z')
      t.mock.timers.enable({ apis: ['Date'], now: start })
      const { store, call, authenticate } = await harness(t)
      const { cookie, token } = await authenticate(tipo)
      t.mock.timers.setTime(start + 20 * 60 * 1000)
      await call('/api/probe', { cookie: cookie.pair })
      t.mock.timers.setTime(start + SESSION_TTL_MS)
      assert.ok(Date.parse((await getStored(store, cookie.sid)).cookie.expires) > Date.now())
      assert.equal((await call(module.path, { cookie: cookie.pair })).status, 200)
      assert.equal((await call(`${module.path}/1`, { cookie: cookie.pair })).status, 200)
      const before = snapshot()
      for (const method of ['POST', 'PUT', 'DELETE']) {
        const response = await call(pathFor(module, method), { method, cookie: cookie.pair, token,
          sourceOrigin: origin, body: bodyFor(module, method) })
        assert.equal(response.status, 401)
        assertSafe(response, true)
        assertUntouched(before)
      }
    })
  }

  test(`${module.plural}: identidades inválidas no autorizan escrituras ni impiden GET públicos`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { cookie } = await authenticate()
    const original = await getStored(store, cookie.sid)
    for (const identity of [{ id: 7, tipo: 'intruso' }, { id: 0, tipo: 'admin' }, { id: '7', tipo: 'admin' }]) {
      await new Promise((resolve, reject) => store.set(cookie.sid, { ...original, identity }, error => error ? reject(error) : resolve()))
      assert.equal((await call(module.path, { cookie: cookie.pair })).status, 200)
      const before = snapshot()
      const response = await call(module.path, { method: 'POST', cookie: cookie.pair, sourceOrigin: origin, body: module.create })
      assert.equal(response.status, 401)
      assertUntouched(before)
    }
  })

  test(`${module.plural}: cookie manipulada y logout conservan catálogo público pero eliminan permisos`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const changedCookie = cookie.pair.slice(0, -1) + (cookie.pair.endsWith('a') ? 'b' : 'a')
    const before = snapshot()
    assert.equal((await call(module.path, { cookie: changedCookie })).status, 200)
    const afterRead = snapshot()
    assert.equal((await call(module.path, { method: 'POST', cookie: changedCookie, token,
      sourceOrigin: origin, body: module.create })).status, 401)
    assertUntouched(afterRead)
    assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin })).status, 200)
    assert.equal((await call(module.path, { cookie: cookie.pair })).status, 200)
    const afterLogout = snapshot()
    assert.equal((await call(`${module.path}/1`, { method: 'DELETE', cookie: cookie.pair, token, sourceOrigin: origin })).status, 401)
    assertUntouched(afterLogout)
    assertNoWrites(before)
  })

  test(`${module.plural}: errores de sesión y parser no llegan a los servicios ni filtran detalles`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const before = snapshot()
    const brokenStore = t.mock.method(store, 'get', (_sid, callback) => callback(new Error(internalDetail)))
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await call(pathFor(module, method), { method, cookie: cookie.pair, token,
        sourceOrigin: origin, body: bodyFor(module, method) })
      assert.equal(response.status, 500)
      assertSafe(response, true)
      assertUntouched(before)
    }
    brokenStore.mock.restore()
    for (const [expected, options] of [[400, { rawBody: `{"password":"${password}",` }],
      [413, { body: { value: 'a'.repeat(110000) } }],
      [415, { rawBody: '{}', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' } }]]) {
      const response = await call(module.path, { method: 'POST', ...options })
      assert.equal(response.status, expected)
      assertSafe(response, true)
      assertUntouched(before)
    }
  })

  test(`${module.plural}: PUT y DELETE inexistentes mantienen las respuestas del servicio`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const before = snapshot()
    for (const method of ['PUT', 'DELETE']) {
      const response = await call(pathFor(module, method, 999), { method, cookie: cookie.pair, token,
        sourceOrigin: origin, body: bodyFor(module, method) })
      assert.equal(response.status, 404)
      assert.deepEqual(response.body, { message: `${module.notFound}` })
      assertSafe(response, true)
      assertNoWrites(before)
    }
  })

  test(`${module.plural}: CSRF vencido no permite escribir aunque la sesión sea válida; puede renovarse`, async t => {
    const { store, call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    const current = await getStored(store, cookie.sid)
    current.csrf.expiresAt = Date.now() - 1
    await new Promise((resolve, reject) => store.set(cookie.sid, current, error => error ? reject(error) : resolve()))
    assert.equal((await call('/api/auth/me', { cookie: cookie.pair })).status, 200)
    const before = snapshot()
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await call(pathFor(module, method), { method, cookie: cookie.pair, token,
        sourceOrigin: origin, body: bodyFor(module, method) })
      assert.equal(response.status, 403)
      assertSafe(response, true)
      assertUntouched(before)
    }
    const renewed = await call('/api/auth/csrf', { cookie: cookie.pair })
    assert.equal(renewed.status, 200)
    assert.notEqual(renewed.body.csrfToken, token)
    const response = await call(module.path, { method: 'POST', cookie: cookie.pair,
      token: renewed.body.csrfToken, sourceOrigin: origin, body: module.create })
    assert.equal(response.status, 201)
  })

  test(`${module.plural}: POST conserva validaciones de descripción, estado y cuerpo sin escrituras inválidas`, async t => {
    const { call, authenticate } = await harness(t)
    const { cookie, token } = await authenticate()
    for (const body of [null, [], { ...module.create, descripcion: '' },
      { ...module.create, descripcion: 123 }, { ...module.create, estado: 'true' }]) {
      const before = snapshot()
      const response = await call(module.path, { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin, body })
      assert.equal(response.status, 400)
      assertNoWrites(before)
      assertSafe(response, true)
    }
    // Los PUT mantienen su contrato actual: solo requireRecord, sin agregar validaciones de campos.
    for (const body of [null, []]) {
      const before = snapshot()
      const response = await call(`${module.path}/1`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
      assert.equal(response.status, 400)
      assertNoWrites(before)
    }
  })
}

test('MetodoEnvio conserva validación del costo y de los campos opcionales al crear', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  const initial = { descripcion: 'Envío ficticio', costo: 10 }
  for (const overrides of [{ costo: -1 }, { costo: '10' }, { costo: 100_000_000 }, { costo: undefined },
    { requiereDireccion: 'true' }, { tiempoEstimado: 10 }, { observacion: 10 }]) {
    const before = snapshot()
    const response = await call('/api/metodos-envio', { method: 'POST', cookie: cookie.pair, token,
      sourceOrigin: origin, body: { ...initial, ...overrides } })
    assert.equal(response.status, 400)
    assertNoWrites(before)
  }
  const response = await call('/api/metodos-envio', { method: 'POST', cookie: cookie.pair, token, sourceOrigin: origin,
    body: { descripcion: '  Retiro ficticio  ', costo: 0, requiereDireccion: false, tiempoEstimado: '', estado: false,
      observacion: '  Retiro en local  ' } })
  assert.equal(response.status, 201)
  assert.equal(response.body.data.descripcion, 'Retiro ficticio')
  assert.equal(response.body.data.costo, 0)
  assert.equal(response.body.data.requiereDireccion, false)
  assert.equal(response.body.data.estado, false)
  assert.equal(response.body.data.tiempoEstimado, undefined)
  assert.equal(response.body.data.observacion, 'Retiro en local')
  assertSafe(response, true)
})

test('Los PUT de métodos mantienen actualizaciones parciales de estado y costo', async t => {
  const { call, authenticate } = await harness(t)
  const { cookie, token } = await authenticate()
  for (const module of modules) {
    const record = storedMethods(module)[0]
    const originalDescription = record.descripcion
    const body = module.entity === 'MetodoEnvio' ? { estado: false, costo: 0 } : { estado: false }
    const response = await call(`${module.path}/1`, { method: 'PUT', cookie: cookie.pair, token, sourceOrigin: origin, body })
    assert.equal(response.status, 200)
    assert.equal(record.descripcion, originalDescription)
    assert.equal(record.estado, false)
    if (module.entity === 'MetodoEnvio') assert.equal(record.costo, 0)
    assertSafe(response, true)
    assert.equal((await call(`${module.path}/1`)).body.data.estado, false)
  }
})

test('Los listados sin métodos conservan respuestas públicas con arrays vacíos', async t => {
  records = records.filter(record => !(record instanceof entities.MetodoPago || record instanceof entities.MetodoEnvio))
  const { call } = await harness(t)
  const before = snapshot()
  for (const module of modules) {
    const response = await call(module.path)
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { message: `found all ${module.plural}`, data: [] })
    assertNoWrites(before)
  }
})

test('Otros prefijos conservan su acceso y los routers de métodos no agregan operaciones', async t => {
  const { call } = await harness(t)
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal((await call('/api/probe', { method })).status, 200)
  for (const module of modules) assert.equal((await call(`${module.path}/1`, { method: 'PATCH' })).status, 404)
})

