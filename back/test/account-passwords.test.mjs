import 'reflect-metadata'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { after, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword, verifyPassword } from '../src/shared/security/password.ts'

// Desde back/, con Node 24:
// node --experimental-test-module-mocks --test test/account-passwords.test.mjs
// Se prueban los servicios reales, sustituyendo su módulo ORM ANTES de importarlos.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-account-service-tests/', import.meta.url)
const guards = []
let ormMock
let roles
let records
let writes

// Este doble solo almacena objetos en memoria. No es un EntityManager conectado.
const em = {
  async findOne(entityClass, criteria) {
    return records.find(record => record instanceof entityClass &&
      Object.entries(criteria).every(([key, value]) => record[key] === value)) ?? null
  },
  create(entityClass, input) {
    const account = Object.assign(new entityClass(), input)
    records.push(account)
    writes.created.push({ ...input })
    return account
  },
  assign(account, input) {
    writes.assigned.push({ ...input })
    return Object.assign(account, input)
  },
  async flush() {
    writes.flushes += 1
  },
}

before(async () => {
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  // Compilar comprueba tipos; no ejecuta orm.ts ni index.ts.
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--strict', '--esModuleInterop',
    '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir),
    'src/cliente/cliente.service.ts', 'src/admin/admin.service.ts',
  ], { cwd: backendDir, stdio: 'pipe' })

  guards.push(mock.method(MikroORM, 'init', () => {
    throw new Error('Estas pruebas no permiten inicializar el ORM real')
  }))
  for (const method of ['connect', 'ensureConnection', 'execute']) {
    guards.push(mock.method(MySqlConnection.prototype, method, () => {
      throw new Error('Estas pruebas no permiten acceder a MySQL')
    }))
  }
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: {
      orm: { em },
      syncSchema() { throw new Error('Estas pruebas no permiten modificar esquemas') },
    },
  })

  const load = path => import(new URL(path, compiledDir).href)
  const { Cliente } = await load('cliente/cliente.entity.js')
  const { Admin } = await load('admin/admin.entity.js')
  const clientes = await load('cliente/cliente.service.js')
  const admins = await load('admin/admin.service.js')
  roles = {
    Cliente: { Entity: Cliente, create: clientes.createCliente, update: clientes.updateCliente },
    Admin: { Entity: Admin, create: admins.createAdmin, update: admins.updateAdmin },
  }
})

beforeEach(() => {
  records = []
  writes = { created: [], assigned: [], flushes: 0 }
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0)
  } finally {
    ormMock?.restore()
    for (const guard of guards) guard.mock.restore()
  }
})

function inputFor(roleName, overrides = {}) {
  return {
    nombre: 'Ana', apellido: 'Prueba', dni: 30111222,
    mail: 'ana@example.com', password: '  Contraseña ficticia 123!  ',
    ...(roleName === 'Cliente' ? { direccion: 'Calle ficticia 123', telefono: '3410000000' } : {}),
    ...overrides,
  }
}

function seed(roleName, overrides = {}) {
  const account = Object.assign(new roles[roleName].Entity(), inputFor(roleName), { id: 1 }, overrides)
  records.push(account)
  return account
}

async function expectStatus(action, statusCode) {
  await assert.rejects(action, error => error.statusCode === statusCode)
}

function assertNoWrites() {
  assert.deepEqual(writes, { created: [], assigned: [], flushes: 0 })
}

for (const roleName of ['Cliente', 'Admin']) {
  test(`${roleName}: crear guarda Argon2id, conserva espacios y no modifica el cuerpo`, async () => {
    const input = inputFor(roleName, { nombre: ' Ana ', mail: ' ANA@EXAMPLE.COM ' })
    const original = structuredClone(input)
    const account = await roles[roleName].create(input)

    assert.match(account.password, /^\$argon2id\$/)
    assert.equal(await verifyPassword(account.password, original.password), true)
    assert.equal(await verifyPassword(account.password, original.password.trim()), false)
    assert.equal(writes.created[0].password, account.password)
    assert.equal(account.nombre, 'Ana')
    assert.equal(account.mail, 'ana@example.com')
    assert.deepEqual(input, original)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: la misma contraseña produce hashes diferentes en cuentas distintas`, async () => {
    const first = await roles[roleName].create(inputFor(roleName))
    const second = await roles[roleName].create(inputFor(roleName, { mail: 'otra@example.com', dni: 30111223 }))
    assert.notEqual(first.password, second.password)
    assert.equal(await verifyPassword(second.password, inputFor(roleName).password), true)
  })

  test(`${roleName}: crear rechaza contraseñas inválidas antes de guardar`, async () => {
    for (const password of [undefined, null, '', '   ', '\t\n', 123, {}, []]) {
      await expectStatus(() => roles[roleName].create(inputFor(roleName, { password })), 400)
      assertNoWrites()
    }
  })

  test(`${roleName}: crear conserva la validación de datos del perfil y del cuerpo`, async () => {
    const invalidFields = [{ nombre: ' ' }, { apellido: null }, { dni: -1 }, { dni: '123' }, { mail: 'inválido' }]
    if (roleName === 'Cliente') invalidFields.push({ direccion: '' }, { telefono: 123 })
    for (const value of [null, [], 'inválido', ...invalidFields.map(overrides => inputFor(roleName, overrides))]) {
      await expectStatus(() => roles[roleName].create(value), 400)
      assertNoWrites()
    }
  })

  test(`${roleName}: crear conserva el rechazo de mail y DNI duplicados`, async () => {
    seed(roleName)
    for (const input of [inputFor(roleName, { dni: 40111222 }), inputFor(roleName, { mail: 'otra@example.com' })]) {
      await expectStatus(() => roles[roleName].create(input), 409)
      assertNoWrites()
    }
  })
}

for (const roleName of ['Cliente', 'Admin']) {
  test(`${roleName}: el PUT del archivo .http sigue funcionando y conserva el hash`, async () => {
    const storedHash = await hashPassword('Contraseña anterior ficticia 123!')
    const account = seed(roleName, { password: storedHash })
    const original = { ...account }
    const moduleName = roleName.toLowerCase()
    // Solo se lee el ejemplo; no se envía ninguna solicitud HTTP.
    const example = readFileSync(new URL(`../src/${moduleName}/${moduleName}.http`, import.meta.url), 'utf8')
    const updateBlock = example.split(/^PUT[^\r\n]*\r?\n/m)[1]
    assert.ok(updateBlock, 'Debe existir un ejemplo de PUT')
    const input = JSON.parse(updateBlock.match(/\{[\s\S]*?\}/)[0])
    const result = await roles[roleName].update(account.id, input)

    assert.equal(result, account)
    assert.equal(account.nombre, input.nombre)
    assert.deepEqual({ ...account }, { ...original, nombre: input.nombre })
    assert.deepEqual(writes.assigned, [input])
    assert.equal(Object.hasOwn(writes.assigned[0], 'password'), false)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: actualizar valida y normaliza los campos permitidos sin modificar el cuerpo`, async () => {
    const account = seed(roleName)
    const originalPassword = account.password
    const originalRelation = account.pedidos
    const input = {
      nombre: ' Bea ', apellido: ' Nueva ', dni: 40111222, mail: ' BEA@EXAMPLE.COM ',
      ...(roleName === 'Cliente' ? { direccion: ' Calle nueva 456 ', telefono: ' 1100000000 ' } : {}),
    }
    const originalInput = structuredClone(input)
    await roles[roleName].update(account.id, input)

    assert.equal(account.nombre, 'Bea')
    assert.equal(account.apellido, 'Nueva')
    assert.equal(account.dni, 40111222)
    assert.equal(account.mail, 'bea@example.com')
    if (roleName === 'Cliente') {
      assert.equal(account.direccion, 'Calle nueva 456')
      assert.equal(account.telefono, '1100000000')
      assert.equal(account.pedidos, originalRelation)
    }
    assert.equal(account.password, originalPassword)
    assert.deepEqual(input, originalInput)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: actualizar password guarda un nuevo hash y conserva sus espacios`, async () => {
    const oldPassword = 'Contraseña anterior ficticia 123!'
    const oldHash = await hashPassword(oldPassword)
    const account = seed(roleName, { password: oldHash })
    const original = { ...account }
    const input = { password: '  Nueva contraseña ficticia ñ🔐 456!  ' }
    const originalInput = { ...input }
    await roles[roleName].update(account.id, input)

    assert.match(account.password, /^\$argon2id\$/)
    assert.notEqual(account.password, oldHash)
    assert.equal(await verifyPassword(account.password, originalInput.password), true)
    assert.equal(await verifyPassword(account.password, originalInput.password.trim()), false)
    assert.equal(await verifyPassword(account.password, oldPassword), false)
    assert.deepEqual({ ...account }, { ...original, password: account.password })
    assert.deepEqual(writes.assigned, [{ password: account.password }])
    assert.deepEqual(input, originalInput)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: un cuerpo vacío sigue siendo válido y no cambia ningún campo`, async () => {
    const account = seed(roleName)
    const original = { ...account }
    await roles[roleName].update(account.id, {})
    assert.deepEqual({ ...account }, original)
    assert.deepEqual(writes.assigned, [{}])
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: actualizar rechaza password inválida sin cambiar siquiera el nombre`, async () => {
    const account = seed(roleName)
    const original = { ...account }
    for (const password of [undefined, null, '', '   ', '\t\n', 123, false, {}, []]) {
      await expectStatus(() => roles[roleName].update(account.id, { nombre: 'Cambio rechazado', password }), 400)
      assert.deepEqual({ ...account }, original)
      assertNoWrites()
    }
  })

  test(`${roleName}: actualizar rechaza cuerpos y campos inválidos sin guardar cambios`, async () => {
    const account = seed(roleName)
    const original = { ...account }
    const invalidFields = [
      { nombre: undefined }, { nombre: ' ' }, { nombre: 123 }, { apellido: null },
      { dni: 0 }, { dni: -1 }, { dni: 1.5 }, { dni: '123' }, { dni: Number.MAX_SAFE_INTEGER + 1 },
      { mail: null }, { mail: '' }, { mail: 'inválido' }, { mail: 'a b@example.com' },
    ]
    if (roleName === 'Cliente') invalidFields.push({ direccion: '' }, { telefono: 123 })
    for (const value of [undefined, null, [], 'inválido', 123, ...invalidFields]) {
      await expectStatus(() => roles[roleName].update(account.id, value), 400)
      assert.deepEqual({ ...account }, original)
      assertNoWrites()
    }
  })

  test(`${roleName}: actualizar rechaza id, relaciones y campos adicionales`, async () => {
    const account = seed(roleName)
    const original = { ...account }
    const forbidden = ['id', 'pedidos', 'rol', 'isAdmin', '__proto__', 'constructor']
    if (roleName === 'Admin') forbidden.push('direccion', 'telefono')
    for (const field of forbidden) {
      await expectStatus(() => roles[roleName].update(account.id, { nombre: 'Cambio rechazado', [field]: 99 }), 400)
      assert.deepEqual({ ...account }, original)
      assertNoWrites()
    }
  })

  test(`${roleName}: actualizar devuelve 409 ante mail de otra cuenta, después de normalizarlo`, async () => {
    const account = seed(roleName)
    seed(roleName, { id: 2, mail: 'otra@example.com', dni: 40111222 })
    const original = { ...account }
    await expectStatus(() => roles[roleName].update(account.id, {
      nombre: 'Cambio rechazado', mail: ' OTRA@EXAMPLE.COM ', password: 'Cambio de clave rechazado',
    }), 409)
    assert.deepEqual({ ...account }, original)
    assertNoWrites()
  })

  test(`${roleName}: actualizar devuelve 409 ante DNI de otra cuenta sin cambios parciales`, async () => {
    const account = seed(roleName)
    seed(roleName, { id: 2, mail: 'otra@example.com', dni: 40111222 })
    const original = { ...account }
    await expectStatus(() => roles[roleName].update(account.id, {
      nombre: 'Cambio rechazado', mail: 'nuevo@example.com', dni: 40111222,
    }), 409)
    assert.deepEqual({ ...account }, original)
    assertNoWrites()
  })

  test(`${roleName}: actualizar acepta su propio mail y DNI sin considerarlos duplicados`, async () => {
    const account = seed(roleName)
    const original = { ...account }
    await roles[roleName].update(account.id, { mail: ' ANA@EXAMPLE.COM ', dni: account.dni })
    assert.deepEqual({ ...account }, original)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: mail y DNI siguen siendo únicos dentro de cada tipo de cuenta`, async () => {
    const account = seed(roleName)
    seed(roleName === 'Cliente' ? 'Admin' : 'Cliente', { id: 2, mail: 'otro-rol@example.com', dni: 40111222 })
    await roles[roleName].update(account.id, { mail: 'otro-rol@example.com', dni: 40111222 })
    assert.equal(account.mail, 'otro-rol@example.com')
    assert.equal(account.dni, 40111222)
    assert.equal(writes.flushes, 1)
  })

  test(`${roleName}: actualizar una cuenta inexistente conserva el error 404`, async () => {
    await expectStatus(() => roles[roleName].update(999, { nombre: 'Ana' }), 404)
    assertNoWrites()
  })

  test(`${roleName}: omitir password no migra automáticamente una contraseña antigua en texto plano`, async () => {
    const legacyPassword = 'Contraseña antigua ficticia en texto plano'
    const account = seed(roleName, { password: legacyPassword })
    await roles[roleName].update(account.id, { apellido: 'Actualizado' })
    assert.equal(account.password, legacyPassword)
    assert.equal(Object.hasOwn(writes.assigned[0], 'password'), false)
  })
}
