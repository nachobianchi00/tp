import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { after, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'

// Desde back/: node --experimental-test-module-mocks --test test/service-errors.test.mjs
// Controladores y helper reales; servicios simulados. No se importa index.ts ni el ORM real.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-service-errors-tests/', import.meta.url)
const genericBody = { message: 'No se pudo procesar la solicitud' }
const sensitiveValues = [
  'SELECT password FROM cliente WHERE mail = ?',
  'password-ficticio-no-publicar',
  '$argon2id$v=19$m=65536,t=3,p=4$hash-ficticio',
  'Cookie: minigo.sid=sesion-ficticia',
  'SESSION_SECRET=secreto-ficticio-no-publicar',
  'mysql://usuario:clave-ficticia@servidor/base',
  'C:\\servidor\\minigo\\src\\shared\\db\\orm.ts:15',
]
const internalMessage = sensitiveValues.join('\n')
const modules = [
  { name: 'Admin', path: 'admin/admin', services: ['findAllAdmins', 'findAdmin', 'createAdmin', 'updateAdmin', 'deleteAdmin'] },
  { name: 'Cliente', path: 'cliente/cliente', services: ['findAllClientes', 'findCliente', 'createCliente', 'updateCliente', 'deleteCliente'] },
  { name: 'Producto', path: 'producto/producto', services: ['findAllProductos', 'findProducto', 'createProducto', 'updateProducto', 'deleteProducto'] },
  { name: 'Categoria', path: 'categoria/categoria', services: ['findAllCategorias', 'findCategoria', 'createCategoria', 'updateCategoria', 'deleteCategoria'] },
  { name: 'MetodoPago', path: 'pedido/metodoPago', services: ['findAllMetodosPago', 'findMetodoPago', 'createMetodoPago', 'updateMetodoPago', 'deleteMetodoPago'] },
  { name: 'MetodoEnvio', path: 'pedido/metodoEnvio', services: ['findAllMetodosEnvio', 'findMetodoEnvio', 'createMetodoEnvio', 'updateMetodoEnvio', 'deleteMetodoEnvio'] },
]
const operations = [
  { action: 'findAll', method: 'GET', path: '/' },
  { action: 'findOne', method: 'GET', path: '/1' },
  { action: 'add', method: 'POST', path: '/' },
  { action: 'update', method: 'PUT', path: '/1' },
  { action: 'remove', method: 'DELETE', path: '/1' },
]
const guards = [], serviceMocks = []
let ormMock, ServiceError, sendServiceError, parseRouteId, failure, calls

before(() => {
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
    ...modules.map(module => `src/${module.path}.controler.ts`),
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  const emGuard = mock.fn(() => { throw new Error('No se permite acceder al ORM real') })
  guards.push(syncGuard, emGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: { orm: { get em() { return emGuard() } }, syncSchema: syncGuard },
  })
})

before(async () => {
  const load = path => import(new URL(path, compiledDir).href)
  ;({ ServiceError, sendServiceError } = await load('shared/service-errors.js'))
  ;({ parseRouteId } = await load('shared/route-params.js'))
  for (const module of modules) {
    const exports = Object.fromEntries(module.services.map(name => [name, async () => {
      calls.push(name)
      throw failure
    }]))
    serviceMocks.push(mock.module(new URL(`${module.path}.service.js`, compiledDir).href, { exports }))
    module.controllers = await load(`${module.path}.controler.js`)
  }
})

beforeEach(() => { calls = []; failure = new Error(internalMessage) })

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'Sin acceso a MySQL, ORM ni syncSchema')
  } finally {
    for (const serviceMock of serviceMocks) serviceMock.restore()
    ormMock?.restore()
    for (const guard of guards) guard.mock?.restore?.()
  }
})

function respond(error) {
  let status, body
  const res = {
    status(value) { status = value; return this },
    json(value) { body = JSON.parse(JSON.stringify(value)); return this },
  }
  assert.equal(sendServiceError(res, error), res)
  return { status, body }
}

function assertPrivate(response) {
  assert.equal(response.status, 500)
  assert.deepEqual(response.body, genericBody)
  const output = JSON.stringify(response.body)
  for (const value of sensitiveValues) assert.equal(output.includes(value), false)
  for (const key of ['stack', 'cause', 'sql', 'password', 'hash', 'cookie', 'secret']) {
    assert.equal(Object.hasOwn(response.body, key), false)
  }
}

for (const [status, message] of [
  [400, 'mail must be a valid email address'],
  [401, 'No autenticado'],
  [403, 'Acceso no autorizado'],
  [404, 'Cliente not found'],
  [409, 'A client with this email already exists'],
]) {
  test(`helper: conserva el código ${status} y el mensaje de negocio`, () => {
    const error = Object.assign(new ServiceError(message, status), { cause: new Error(internalMessage) })
    assert.deepEqual(respond(error), { status, body: { message } })
  })
}

for (const [name, create] of [
  ['error SQL/ORM con propiedades internas', () => Object.assign(new Error(internalMessage), { sql: internalMessage, parameters: sensitiveValues })],
  ['TypeError interno', () => new TypeError(internalMessage)],
  ['RangeError interno', () => new RangeError(internalMessage)],
  ['error con stack y causa', () => Object.assign(new Error(internalMessage, { cause: new Error(internalMessage) }), { stack: internalMessage })],
  ['AggregateError', () => new AggregateError([new Error(internalMessage)], internalMessage)],
  ['objeto que imita un error público', () => ({ statusCode: 400, message: internalMessage, stack: internalMessage })],
  ['string', () => internalMessage],
  ['null', () => null],
  ['undefined', () => undefined],
  ['objeto que no se puede convertir a string', () => ({ toString() { throw new Error('No debe llamarse') } })],
  ['ServiceError 500', () => new ServiceError(internalMessage, 500)],
  ['ServiceError 503', () => new ServiceError(internalMessage, 503)],
  ['ServiceError con código inválido', () => new ServiceError(internalMessage, 200)],
]) {
  test(`helper: oculta ${name}`, () => assertPrivate(respond(create())))
}

for (const [value, message] of [
  [['1', '2'], 'Route parameter id must be a single string'],
  ['invalido', 'Route parameter id must be a safe integer'],
]) {
  test(`helper: conserva la validación existente "${message}"`, () => {
    let error
    try { parseRouteId(value) } catch (caught) { error = caught }
    assert.ok(error instanceof TypeError)
    assert.deepEqual(respond(error), { status: 400, body: { message } })
    assertPrivate(respond(new TypeError(`${message}: ${internalMessage}`)))
  })
}

async function harness(t, module) {
  const app = express()
  app.use(express.json())
  // Se prueba el manejo de errores de los controladores; las políticas de acceso
  // permanecen cubiertas por las suites existentes de cada router.
  for (const operation of operations) app[operation.method.toLowerCase()](
    operation.path === '/' ? '/' : '/:id', module.controllers[operation.action],
  )
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  return (operation, path = operation.path) => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path,
      method: operation.method, agent: false }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: res.headers }) }
        catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

for (const module of modules) {
  for (const operation of operations) {
    test(`${module.name}: ${operation.action} oculta fallos inesperados por HTTP`, async t => {
      const call = await harness(t, module)
      for (const create of [
        () => new Error(internalMessage), () => new TypeError(internalMessage),
        () => new RangeError(internalMessage), () => new ServiceError(internalMessage, 500),
      ]) {
        failure = create()
        const response = await call(operation)
        assertPrivate(response)
        assert.match(response.headers['content-type'], /application\/json/)
      }
      assert.deepEqual(calls, Array(4).fill(module.services[operations.indexOf(operation)]))
    })
  }

  test(`${module.name}: los cinco controladores conservan 400, 404 y 409 de negocio`, async t => {
    const call = await harness(t, module)
    for (const [status, message] of [[400, 'Datos inválidos'], [404, 'Cuenta o recurso inexistente'], [409, 'Conflicto de negocio']]) {
      failure = new ServiceError(message, status)
      for (const operation of operations) {
        const response = await call(operation)
        assert.equal(response.status, status)
        assert.deepEqual(response.body, { message })
      }
    }
    assert.equal(calls.length, 15)
  })

  test(`${module.name}: IDs inválidos conservan 400 sin llamar al servicio`, async t => {
    const call = await harness(t, module)
    for (const operation of operations.filter(operation => operation.path !== '/')) {
      const response = await call(operation, '/invalido')
      assert.equal(response.status, 400)
      assert.deepEqual(response.body, { message: 'Route parameter id must be a safe integer' })
    }
    assert.deepEqual(calls, [])
  })
}
