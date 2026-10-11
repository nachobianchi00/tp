import 'reflect-metadata'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { after, before, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { serialize, wrap } from '@mikro-orm/core'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword } from '../src/shared/security/password.ts'

// Desde back/, con Node 24: node --test test/password-serialization.test.mjs
// Solo se compilan y cargan entidades: nunca orm.ts, servicios, controladores ni index.ts.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-serialization-tests/', import.meta.url)
let orm
let Cliente
let Admin
let Pedido
let EstadoPedido
let secrets
const connectionGuards = []

before(async () => {
  // Los decoradores actuales necesitan la metadata emitida por TypeScript.
  // La compilación también comprueba los tipos y deja sus archivos en node_modules (ignorado).
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--strict', '--esModuleInterop',
    '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir),
    'src/cliente/cliente.entity.ts', 'src/admin/admin.entity.ts',
    'src/pedido/pedido.entity.ts',
  ], { cwd: backendDir, stdio: 'pipe' })

  // Cualquier intento de conexión o consulta falla antes de acceder a MySQL.
  for (const method of ['connect', 'ensureConnection', 'execute']) {
    connectionGuards.push(mock.method(MySqlConnection.prototype, method, () => {
      throw new Error('Estas pruebas no permiten conexiones ni consultas a MySQL')
    }))
  }

  const load = path => import(new URL(path, compiledDir).href)
  ;({ Cliente } = await load('cliente/cliente.entity.js'))
  ;({ Admin } = await load('admin/admin.entity.js'))
  ;({ Pedido, EstadoPedido } = await load('pedido/pedido.entity.js'))
  const { DetallePedido } = await load('pedido/detallePedido.entity.js')
  const { MetodoPago } = await load('pedido/metodoPago.entity.js')
  const { MetodoEnvio } = await load('pedido/metodoEnvio.entity.js')
  const { Pago } = await load('pedido/pago.entity.js')
  const { Producto } = await load('producto/producto.entity.js')
  const { Categoria } = await load('categoria/categoria.entity.js')

  // En MikroORM 7 el constructor descubre metadata sin abrir la conexión.
  orm = new MikroORM({
    entities: [Cliente, Admin, Pedido, DetallePedido, MetodoPago, MetodoEnvio, Pago, Producto, Categoria],
    entitiesTs: [],
    metadataProvider: ReflectMetadataProvider,
    dbName: 'minigo_serialization_tests',
    clientUrl: 'mysql://test@127.0.0.1/minigo_serialization_tests',
    debug: false,
    metadataCache: { enabled: false },
    extensions: [],
  })

  const password = 'Contraseña ficticia de serialización 123!'
  secrets = {
    'texto plano': password,
    'hash Argon2id': await hashPassword(password),
  }
})

after(async () => {
  try {
    await orm?.close()
    for (const guard of connectionGuards) {
      assert.equal(guard.mock.callCount(), 0, 'No debe haber intentos de conexión o consulta')
    }
  } finally {
    for (const guard of connectionGuards) guard.mock.restore()
  }
})

function createAccount(entityClass, secret) {
  const account = Object.assign(new entityClass(), {
    id: 1,
    nombre: 'Ana',
    apellido: 'Prueba',
    dni: 30111222,
    mail: 'ana@example.com',
    password: secret,
  })
  if (entityClass === Cliente) {
    account.direccion = 'Dirección ficticia 123'
    account.telefono = '3410000000'
  }
  return account
}

function assertSafeResponse(data, secret) {
  const json = JSON.stringify({ message: 'respuesta de prueba', data })
  assert.equal(json.includes(secret), false, 'El valor secreto no debe aparecer en el JSON')
  const response = JSON.parse(json)
  const visit = value => {
    if (value === null || typeof value !== 'object') return
    assert.equal(Object.hasOwn(value, 'password'), false, 'No debe existir password, tampoco en relaciones')
    for (const child of Object.values(value)) visit(child)
  }
  visit(response)
  return response.data
}

for (const entityName of ['Cliente', 'Admin']) {
  for (const secretKind of ['texto plano', 'hash Argon2id']) {
    test(`${entityName}: respuesta individual sin ${secretKind}`, () => {
      const account = createAccount(entityName === 'Cliente' ? Cliente : Admin, secrets[secretKind])
      const data = assertSafeResponse(account, secrets[secretKind])

      assert.equal(data.id, account.id)
      assert.equal(data.nombre, account.nombre)
      assert.equal(data.mail, account.mail)
      assertSafeResponse(wrap(account).toObject(), secrets[secretKind])
      assertSafeResponse(serialize(account), secrets[secretKind])
      assert.equal(account.password, secrets[secretKind], 'La contraseña sigue disponible internamente')
    })

    test(`${entityName}: listado sin ${secretKind}`, () => {
      const account = createAccount(entityName === 'Cliente' ? Cliente : Admin, secrets[secretKind])
      const data = assertSafeResponse([account], secrets[secretKind])

      assert.equal(data.length, 1)
      assert.equal(data[0].nombre, account.nombre)
      assert.equal(data[0].mail, account.mail)
    })
  }
}

for (const secretKind of ['texto plano', 'hash Argon2id']) {
  test(`Pedido: Cliente relacionado sin ${secretKind}`, () => {
    const cliente = createAccount(Cliente, secrets[secretKind])
    const pedido = Object.assign(new Pedido(), {
      id: 10,
      estado: EstadoPedido.PENDIENTE,
      fechaCreacion: new Date('2026-10-10T12:00:00Z'),
      total: 100,
      cliente,
    })
    // Simula una relación cargada como populate: ['cliente'], sin consultar la base.
    wrap(cliente).populated()
    const data = assertSafeResponse(pedido, secrets[secretKind])

    assert.equal(data.id, pedido.id)
    assert.equal(data.cliente.id, cliente.id)
    assert.equal(data.cliente.nombre, cliente.nombre)
    assert.equal(data.cliente.mail, cliente.mail)
    assertSafeResponse(serialize(pedido, { populate: ['cliente'] }), secrets[secretKind])
    assert.equal(cliente.password, secrets[secretKind])
  })
}
