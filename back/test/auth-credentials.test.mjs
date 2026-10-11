import 'reflect-metadata'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { after, before, beforeEach, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { hashPassword, verifyPassword } from '../src/shared/security/password.ts'

// Desde back/, con Node 24:
// node --experimental-test-module-mocks --test test/auth-credentials.test.mjs
// El módulo ORM se sustituye antes de cargar el servicio. Nunca se importa index.ts.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-auth-credentials-tests/', import.meta.url)
const guards = []
const moduleMocks = []
const verification = mock.fn(verifyPassword)
const writeGuards = []
const password = '  Contraseña ficticia de autenticación ñ🔐 123!  '
let storedHash
let entities
let verifyCredentials
let records
let lookups
let lookupFailure

const em = {
  async findOne(entityClass, criteria, options) {
    lookups.push({ entityClass, criteria, options })
    if (lookupFailure) throw lookupFailure
    return records.find(account => account instanceof entityClass && account.mail === criteria.mail) ?? null
  },
}

// Cualquier escritura del servicio hace fallar la prueba, incluso sobre el doble.
for (const method of ['create', 'assign', 'persist', 'remove', 'flush', 'transactional']) {
  const guard = mock.fn(() => { throw new Error('La verificación no permite escrituras') })
  em[method] = guard
  writeGuards.push(guard)
}

before(async () => {
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  // Compilar comprueba tipos y deja archivos en node_modules (ignorado), sin ejecutar el ORM.
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--strict', '--esModuleInterop',
    '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir),
    'src/auth/auth.service.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })

  guards.push(mock.method(MikroORM, 'init', () => {
    throw new Error('Estas pruebas no permiten inicializar el ORM real')
  }))
  for (const method of ['connect', 'ensureConnection', 'execute']) {
    guards.push(mock.method(MySqlConnection.prototype, method, () => {
      throw new Error('Estas pruebas no permiten acceder a MySQL')
    }))
  }
  moduleMocks.push(mock.module(new URL('shared/db/orm.js', compiledDir).href, {
    exports: {
      orm: { em },
      syncSchema() { throw new Error('Estas pruebas no permiten modificar esquemas') },
    },
  }))
  // El espía llama a la utilidad real y a Argon2 real; permite simular un fallo de verificación.
  moduleMocks.push(mock.module(new URL('shared/security/password.js', compiledDir).href, {
    exports: { hashPassword, verifyPassword: verification },
  }))

  const { Cliente } = await import(new URL('cliente/cliente.entity.js', compiledDir).href)
  const { Admin } = await import(new URL('admin/admin.entity.js', compiledDir).href)
  entities = { cliente: Cliente, admin: Admin }
  ;({ verifyCredentials } = await import(new URL('auth/auth.service.js', compiledDir).href))
  storedHash = await hashPassword(password)
})

beforeEach(() => {
  records = []
  lookups = []
  lookupFailure = undefined
  verification.mock.resetCalls()
})

after(() => {
  try {
    for (const guard of [...guards, ...writeGuards]) {
      assert.equal(guard.mock.callCount(), 0, 'No debe haber acceso a MySQL ni escrituras')
    }
  } finally {
    for (const moduleMock of moduleMocks) moduleMock.restore()
    for (const guard of guards) guard.mock.restore()
  }
})

function seed(tipo, overrides = {}) {
  const account = Object.assign(new entities[tipo](), {
    id: 7, nombre: 'Ana', apellido: 'Prueba', dni: 30111222,
    mail: 'ana@example.com', password: storedHash,
    ...(tipo === 'cliente' ? { direccion: 'Calle ficticia 123', telefono: '3410000000' } : {}),
    ...overrides,
  })
  records.push(account)
  return account
}

function credentials(tipo, overrides = {}) {
  return { tipo, mail: 'ana@example.com', password, ...overrides }
}

async function expectInvalid(action) {
  await assert.rejects(action, error => {
    assert.equal(error.name, 'Error')
    assert.equal(error.statusCode, 401)
    assert.equal(error.message, 'Credenciales inválidas')
    assert.equal(Object.hasOwn(error, 'password'), false)
    assert.equal(Object.hasOwn(error, 'mail'), false)
    return true
  })
}

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: devuelve únicamente la identidad de la cuenta verificada`, async () => {
    const account = seed(tipo)
    const original = { ...account }
    const input = credentials(tipo, { id: 999, nombre: 'Identidad falsa', rol: 'admin' })
    const originalInput = structuredClone(input)
    const identity = await verifyCredentials(input)

    assert.deepEqual(identity, { id: account.id, tipo })
    assert.deepEqual(JSON.parse(JSON.stringify(identity)), { id: account.id, tipo })
    assert.deepEqual({ ...account }, original)
    assert.deepEqual(input, originalInput)
    assert.deepEqual(lookups, [{ entityClass: entities[tipo], criteria: { mail: account.mail }, options: undefined }])
  })

  test(`${tipo}: normaliza el mail y conserva exactamente los espacios de password`, async () => {
    seed(tipo)
    const identity = await verifyCredentials(credentials(tipo, { mail: ' ANA@EXAMPLE.COM ' }))
    assert.deepEqual(identity, { id: 7, tipo })
    await expectInvalid(() => verifyCredentials(credentials(tipo, { password: password.trim() })))
  })

  test(`${tipo}: contraseña incorrecta produce el error genérico y no modifica la cuenta`, async () => {
    const account = seed(tipo)
    const original = { ...account }
    await expectInvalid(() => verifyCredentials(credentials(tipo, { password: 'Contraseña incorrecta ficticia' })))
    assert.deepEqual({ ...account }, original)
  })

  test(`${tipo}: cuenta inexistente produce el mismo error y también realiza verificación Argon2`, async () => {
    await expectInvalid(() => verifyCredentials(credentials(tipo)))
    assert.equal(verification.mock.callCount(), 1)
    assert.match(verification.mock.calls[0].arguments[0], /^\$argon2id\$/)
    assert.equal(verification.mock.calls[0].arguments[1], password)
  })

  test(`${tipo}: no busca ni autentica una cuenta que existe solamente en el otro tipo`, async () => {
    seed(tipo === 'cliente' ? 'admin' : 'cliente')
    await expectInvalid(() => verifyCredentials(credentials(tipo)))
    assert.equal(lookups.length, 1)
    assert.equal(lookups[0].entityClass, entities[tipo])
  })

  test(`${tipo}: rechaza texto plano aunque coincida y rechaza hashes inválidos sin migrar`, async () => {
    const account = seed(tipo)
    for (const invalidHash of [password, '', 'hash dañado ficticio', '$argon2id$v=19$invalid', null, undefined, 123]) {
      account.password = invalidHash
      const original = { ...account }
      await expectInvalid(() => verifyCredentials(credentials(tipo)))
      assert.deepEqual({ ...account }, original)
    }
  })

  test(`${tipo}: un fallo de la biblioteca no concede acceso ni expone su mensaje`, async () => {
    seed(tipo)
    verification.mock.mockImplementationOnce(() => { throw new Error('Detalle interno ficticio que no debe exponerse') })
    await expectInvalid(() => verifyCredentials(credentials(tipo)))
  })

  test(`${tipo}: valida mail y password antes de buscar la cuenta`, async () => {
    const invalidFields = [
      { mail: undefined }, { mail: null }, { mail: '' }, { mail: 'inválido' }, { mail: 'a b@example.com' }, { mail: 123 },
      { password: undefined }, { password: null }, { password: '' }, { password: '   ' }, { password: '\t\n' },
      { password: 123 }, { password: false }, { password: {} }, { password: [] },
    ]
    for (const overrides of invalidFields) {
      await assert.rejects(() => verifyCredentials(credentials(tipo, overrides)), error => error.statusCode === 400)
    }
    assert.equal(lookups.length, 0)
    assert.equal(verification.mock.callCount(), 0)
  })

  test(`${tipo}: no devuelve una identidad con ID ausente o inválido`, async () => {
    const account = seed(tipo)
    for (const id of [undefined, 0, -1, 1.5, '7']) {
      account.id = id
      await expectInvalid(() => verifyCredentials(credentials(tipo)))
    }
  })

  test(`${tipo}: los errores de almacenamiento son 500 genéricos, no credenciales incorrectas`, async () => {
    lookupFailure = new Error('Detalle interno ficticio del almacenamiento')
    await assert.rejects(() => verifyCredentials(credentials(tipo)), error => {
      assert.equal(error.statusCode, 500)
      assert.equal(error.message, 'No se pudieron verificar las credenciales')
      return true
    })
    assert.equal(verification.mock.callCount(), 0)
  })
}

test('un mismo mail en ambos tipos devuelve identidades independientes y verifica la contraseña de cada uno', async () => {
  seed('cliente', { id: 7 })
  const adminPassword = 'Contraseña ficticia exclusiva de Admin 456!'
  seed('admin', { id: 8, password: await hashPassword(adminPassword) })

  assert.deepEqual(await verifyCredentials(credentials('cliente')), { id: 7, tipo: 'cliente' })
  assert.deepEqual(await verifyCredentials(credentials('admin', { password: adminPassword })), { id: 8, tipo: 'admin' })
  await expectInvalid(() => verifyCredentials(credentials('admin')))
  await expectInvalid(() => verifyCredentials(credentials('cliente', { password: adminPassword })))
})

test('rechaza cuerpos y tipos de cuenta inválidos sin buscar ni verificar contraseñas', async () => {
  const invalidInputs = [
    undefined, null, [], 'inválido', 123,
    ...[undefined, null, '', 'Cliente', 'superadmin', 'constructor', '__proto__', 123, {}]
      .map(tipo => credentials(tipo)),
  ]
  for (const input of invalidInputs) {
    await assert.rejects(() => verifyCredentials(input), error => error.statusCode === 400)
  }
  assert.equal(lookups.length, 0)
  assert.equal(verification.mock.callCount(), 0)
})

test('la verificación ficticia nunca autentica una cuenta inexistente aunque devuelva true', async () => {
  verification.mock.mockImplementationOnce(async () => true)
  await expectInvalid(() => verifyCredentials(credentials('cliente')))
})

test('si fallan tanto la verificación real como la ficticia se mantiene el error genérico', async () => {
  seed('admin')
  verification.mock.mockImplementationOnce(async () => { throw new Error('Fallo ficticio de la biblioteca') }, 0)
  verification.mock.mockImplementationOnce(async () => { throw new Error('Fallo ficticio adicional') }, 1)
  await expectInvalid(() => verifyCredentials(credentials('admin')))
  assert.equal(verification.mock.callCount(), 2)
})
