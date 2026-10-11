import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { after, before, mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'

// Desde back/: node --experimental-test-module-mocks --test test/account-auth.test.mjs
// Solo consultas simuladas: nunca se importa index.ts ni se inicializa MikroORM.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-account-auth-tests/', import.meta.url)
const guards = []
let createAccountAuthVerifier, ServiceError

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
    '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir), 'src/auth/account-auth.service.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  execFileSync(process.execPath, [compiler, ...typeOptions, '--noEmit', 'test/account-auth-types.test.ts'], {
    cwd: backendDir, stdio: 'pipe', encoding: 'utf8',
  })
  ;({ createAccountAuthVerifier } = await import(new URL('auth/account-auth.service.js', compiledDir).href))
  ;({ ServiceError } = await import(new URL('shared/service-errors.js', compiledDir).href))
})

after(() => {
  try {
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0, 'No debe haber acceso a MySQL')
  } finally {
    for (const guard of guards) guard.mock.restore()
  }
})

const state = (tipo, authVersion = 0, overrides = {}) => ({ id: 7, tipo, authVersion, ...overrides })
const invalidVersions = [
  ['ausente', undefined], ['null', null], ['texto', '0'], ['booleano', false],
  ['negativa', -1], ['decimal', 0.5], ['NaN', NaN], ['infinita', Infinity],
  ['insegura', Number.MAX_SAFE_INTEGER + 1], ['objeto', { value: 0 }], ['arreglo', [0]],
]

for (const tipo of ['cliente', 'admin']) {
  test(`${tipo}: una versión heredada no reemplaza el campo ausente`, async () => {
    const inherited = Object.assign(Object.create({ authVersion: 0 }), { id: 7, tipo })
    const lookup = mock.fn(async () => state(tipo))
    assert.equal(await createAccountAuthVerifier(lookup)(inherited), null)
    assert.equal(lookup.mock.callCount(), 0)
    assert.equal(await createAccountAuthVerifier(async () => inherited)(state(tipo)), null)
  })

  for (const version of [0, 1, 42, Number.MAX_SAFE_INTEGER]) {
    test(`${tipo}: acepta la versión segura ${version} y devuelve solo la identidad`, async () => {
      const account = state(tipo, version, { password: 'hash-ficticio', mail: 'cuenta@example.test' })
      const lookup = mock.fn(async () => account)
      const input = Object.freeze(state(tipo, version))
      const identity = await createAccountAuthVerifier(lookup)(input)
      assert.deepEqual(identity, { id: 7, tipo })
      assert.equal(JSON.stringify(identity), JSON.stringify({ id: 7, tipo }))
      assert.deepEqual(lookup.mock.calls[0].arguments, [{ id: 7, tipo }])
      assert.equal(lookup.mock.callCount(), 1)
      identity.id = 999
      assert.equal(account.id, 7)
      assert.equal(input.id, 7)
    })
  }

  for (const [label, version] of invalidVersions) {
    test(`${tipo}: rechaza versión de sesión ${label} sin consultar`, async () => {
      const lookup = mock.fn(async () => state(tipo))
      const input = state(tipo, 0, { authVersion: version })
      if (label === 'ausente') delete input.authVersion
      assert.equal(await createAccountAuthVerifier(lookup)(input), null)
      assert.equal(lookup.mock.callCount(), 0)
    })
    test(`${tipo}: rechaza versión de cuenta ${label}`, async () => {
      const account = state(tipo, 0, { authVersion: version })
      if (label === 'ausente') delete account.authVersion
      assert.equal(await createAccountAuthVerifier(async () => account)(state(tipo)), null)
    })
  }

  for (const version of [1, 6]) {
    test(`${tipo}: rechaza versión distinta ${version}, incluso una sesión adelantada`, async () => {
      assert.equal(await createAccountAuthVerifier(async () => state(tipo, 3))(state(tipo, version)), null)
    })
  }

  for (const [label, account] of [
    ['inexistente', null], ['respuesta ausente', undefined], ['respuesta vacía', {}],
    ['respuesta arreglo', []], ['ID diferente', state(tipo, 0, { id: 8 })],
    ['tipo diferente', state(tipo === 'cliente' ? 'admin' : 'cliente')],
    ['ID inválido', state(tipo, 0, { id: '7' })], ['tipo inválido', state('otro')],
  ]) {
    test(`${tipo}: no concede acceso con cuenta ${label}`, async () => {
      assert.equal(await createAccountAuthVerifier(async () => account)(state(tipo)), null)
    })
  }

  test(`${tipo}: vuelve a consultar y rechaza después de cambiar la versión o eliminar la cuenta`, async () => {
    let account = state(tipo)
    const input = state(tipo)
    const lookup = mock.fn(async () => account)
    const verify = createAccountAuthVerifier(lookup)
    assert.deepEqual(await verify(input), { id: 7, tipo })
    account = state(tipo, 1)
    assert.equal(await verify(input), null)
    account = null
    assert.equal(await verify(input), null)
    assert.equal(lookup.mock.callCount(), 3)
  })

  test(`${tipo}: un fallo posterior no reutiliza una verificación exitosa`, async () => {
    let failure
    const verify = createAccountAuthVerifier(async () => {
      if (failure) throw failure
      return state(tipo)
    })
    assert.deepEqual(await verify(state(tipo)), { id: 7, tipo })
    failure = new Error('SQL SELECT password; cookie=secreto-ficticio; C:/servidor/privado')
    await assert.rejects(() => verify(state(tipo)), error => {
      assert.ok(error instanceof ServiceError)
      assert.equal(error.statusCode, 500)
      assert.equal(error.message, 'No se pudo verificar el estado de autenticación')
      assert.equal(error.cause, undefined)
      assert.doesNotMatch(error.stack, /SELECT|secreto-ficticio|servidor\/privado/)
      assert.doesNotMatch(JSON.stringify(error), /SELECT|secreto-ficticio|servidor\/privado/)
      return true
    })
  })

  test(`${tipo}: tampoco propaga errores de negocio ni rechazos sin Error del almacenamiento`, async () => {
    for (const failure of [new ServiceError('detalle privado', 404), 'secreto ficticio', null]) {
      await assert.rejects(() => createAccountAuthVerifier(async () => { throw failure })(state(tipo)), error => {
        assert.equal(error.statusCode, 500)
        assert.equal(error.message, 'No se pudo verificar el estado de autenticación')
        return true
      })
    }
  })
}

for (const [label, input] of [
  ['ausente', undefined], ['null', null], ['texto', '7'], ['arreglo', []], ['vacío', {}],
  ['ID ausente', { tipo: 'cliente', authVersion: 0 }],
  ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '7', null]
    .map((id, index) => [`ID inválido ${index}`, state('cliente', 0, { id })]),
  ['tipo ausente', { id: 7, authVersion: 0 }], ['tipo inválido', state('otro')],
]) {
  test(`rechaza identidad ${label} sin consultar el almacenamiento`, async () => {
    const lookup = mock.fn(async () => state('cliente'))
    assert.equal(await createAccountAuthVerifier(lookup)(input), null)
    assert.equal(lookup.mock.callCount(), 0)
  })
}

test('distingue Cliente y Admin con el mismo ID, sin consultar por ID solamente', async () => {
  const accounts = [state('cliente', 2), state('admin', 5)]
  const lookup = mock.fn(async key => accounts.find(account => account.id === key.id && account.tipo === key.tipo) ?? null)
  const verify = createAccountAuthVerifier(lookup)
  assert.deepEqual(await verify(state('cliente', 2)), { id: 7, tipo: 'cliente' })
  assert.deepEqual(await verify(state('admin', 5)), { id: 7, tipo: 'admin' })
  assert.equal(await verify(state('cliente', 5)), null)
  assert.equal(await verify(state('admin', 2)), null)
})

test('conserva la clave y versión iniciales aunque cambien los objetos durante la consulta', async () => {
  const input = state('cliente')
  const verify = createAccountAuthVerifier(async key => {
    input.authVersion = 1
    input.tipo = 'admin'
    key.id = 8
    return state('cliente', 1, { id: 8 })
  })
  assert.equal(await verify(input), null)
})
