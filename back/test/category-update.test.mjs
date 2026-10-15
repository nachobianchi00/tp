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
import { FlushMode, IsolationLevel, LockMode, UniqueConstraintViolationException } from '@mikro-orm/core'
import { MikroORM, MySqlConnection } from '@mikro-orm/mysql'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'

// Desde back/: node --experimental-test-module-mocks --test test/category-update.test.mjs
// Servicio y router reales. Los bloqueos/commit son simulados: no prueban concurrencia real de MySQL.
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const compiledDir = new URL('../node_modules/.cache/minigo-category-update-tests/', import.meta.url)
const origin = 'https://minigo.example'
const internalDetail = 'SELECT password FROM cliente; $argon2id$hash-ficticio; Cookie: minigo.sid=ficticia; SESSION_SECRET=ficticio; C:\\servidor\\orm.ts:15'
const originalEnv = { secret: process.env.SESSION_SECRET, nodeEnv: process.env.NODE_ENV }
const guards = []
let ormMock, serviceMock, Categoria, ServiceError, updateCategoria, createCategoriaRouter, categoriaAccessErrorHandler
let createSessionMiddleware, getCsrfToken, SESSION_TTL_MS
let records, queries, assignments, events, flushes, commits, rollbacks, serviceCalls, beforeTransaction, transactionFailure

function findIn(rows, criteria) {
  return rows.find(row => Object.entries(criteria).every(([key, value]) => row[key] === value)) ?? null
}
function snapshot() {
  return records.map(row => ({ id: row.id, nombre: row.nombre, padre: row.categoriaPadre?.id ?? null,
    subcategorias: row.subcategorias.map(item => item.id), productos: structuredClone(row.productos) }))
}
function cloneGraph() {
  const rows = records.map(row => ({ ...row }))
  for (const row of rows) row.categoriaPadre = rows.find(parent => parent.id === row.categoriaPadre?.id) ?? row.categoriaPadre
  return rows
}

const em = {
  // Las sesiones de estas pruebas pertenecen a cuentas ficticias de ID 7.
  async count(Entity, criteria) {
    assert.ok(['Cliente', 'Admin'].includes(Entity.name))
    return criteria.id === 7 ? 1 : 0
  },
  async findOne(Entity, criteria, options) {
    assert.equal(Entity, Categoria)
    queries.push({ context: 'outer', criteria, options })
    return findIn(records, criteria)
  },
  assign(entity, input) {
    assignments.push({ context: 'outer', id: entity.id, input })
    Object.assign(entity, input)
  },
  async flush() { flushes++ },
  async transactional(callback, options) {
    assert.deepEqual(options, { clear: true, flushMode: FlushMode.COMMIT, isolationLevel: IsolationLevel.READ_COMMITTED },
      'Aislar entidades, evitar autoflush y no reutilizar una fotografía anterior a los bloqueos')
    events.push({ operation: 'begin', options })
    beforeTransaction?.()
    const rows = cloneGraph()
    const tx = {
      async find(Entity, criteria, options) {
        assert.equal(Entity, Categoria)
        assert.deepEqual(criteria, {})
        assert.deepEqual(options, { fields: ['id'], orderBy: { id: 'asc' }, flushMode: FlushMode.COMMIT })
        queries.push({ context: 'transaction', operation: 'find', criteria, options })
        events.push({ operation: 'ids' })
        // El servicio debe tomar los bloqueos por ID aunque el doble devuelva otra ordenación.
        return [...rows].reverse().map(row => ({ id: row.id }))
      },
      async findOne(Entity, criteria, options) {
        assert.equal(Entity, Categoria)
        assert.equal(options.flushMode, FlushMode.COMMIT)
        queries.push({ context: 'transaction', operation: 'findOne', criteria, options })
        if (options.lockMode) {
          assert.equal(options.lockMode, LockMode.PESSIMISTIC_WRITE)
          assert.equal(options.refresh, true, 'No basarse en la identidad cargada antes de la transacción')
          assert.equal(options.populate, false, 'No agregar joins al tomar bloqueos')
          if (transactionFailure === 'lock') throw new Error(internalDetail)
          const row = Object.keys(criteria).length === 0
            ? [...rows].sort((a, b) => a.id - b.id)[0] ?? null : findIn(rows, criteria)
          if (Object.keys(criteria).length === 0) assert.deepEqual(options.orderBy, { id: 'asc' })
          events.push({ operation: 'lock', id: row?.id })
          return row
        }
        events.push({ operation: 'name' })
        return findIn(rows, criteria)
      },
      async populate(entity, properties) {
        assert.deepEqual(properties, ['subcategorias', 'productos'])
        events.push({ operation: 'populate', id: entity.id })
        if (transactionFailure === 'populate') throw new Error(internalDetail)
        return entity
      },
      assign(entity, input) {
        events.push({ operation: 'assign', id: entity.id })
        assignments.push({ context: 'transaction', id: entity.id, input })
        Object.assign(entity, input)
      },
    }
    try {
      const result = await callback(tx)
      // MikroORM transactional() ejecuta flush solamente después de completar el callback.
      events.push({ operation: 'flush' })
      flushes++
      if (transactionFailure === 'flush') throw new Error(internalDetail)
      if (transactionFailure === 'unique') throw new UniqueConstraintViolationException(new Error(internalDetail))
      for (const row of rows) {
        const stored = records.find(stored => stored.id === row.id)
        stored.nombre = row.nombre
        stored.categoriaPadre = records.find(parent => parent.id === row.categoriaPadre?.id) ?? null
      }
      commits++
      events.push({ operation: 'commit' })
      return result
    } catch (error) {
      rollbacks++
      events.push({ operation: 'rollback' })
      throw error
    }
  },
}

before(async () => {
  for (const [target, method] of [[MikroORM, 'init'],
    ...['connect', 'ensureConnection', 'execute'].map(method => [MySqlConnection.prototype, method])]) {
    guards.push(mock.method(target, method, () => { throw new Error('No se permite acceder a MySQL') }))
  }
  for (const method of ['create', 'remove', 'persist']) {
    em[method] = mock.fn(() => { throw new Error(`Estas pruebas no permiten ${method}`) })
    guards.push(em[method])
  }
  mkdirSync(compiledDir, { recursive: true })
  writeFileSync(new URL('package.json', compiledDir), '{"type":"module"}\n')
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--strict', '--esModuleInterop', '--experimentalDecorators', '--emitDecoratorMetadata', '--skipLibCheck',
    '--noEmitOnError', '--rootDir', 'src', '--outDir', fileURLToPath(compiledDir), 'src/categoria/categoria.routes.ts',
  ], { cwd: backendDir, stdio: 'pipe', encoding: 'utf8' })
  const syncGuard = mock.fn(() => { throw new Error('No se permiten cambios de esquema') })
  guards.push(syncGuard)
  ormMock = mock.module(new URL('shared/db/orm.js', compiledDir).href, { exports: { orm: { em }, syncSchema: syncGuard } })
  const load = path => import(new URL(path, compiledDir).href)
  ;({ Categoria } = await load('categoria/categoria.entity.js'))
  ;({ ServiceError } = await load('shared/service-errors.js'))
  const service = await load('categoria/categoria.service.js')
  updateCategoria = service.updateCategoria
  serviceMock = mock.module(new URL('categoria/categoria.service.js', compiledDir).href, {
    exports: { ...service, updateCategoria: (...args) => { serviceCalls++; return updateCategoria(...args) } },
  })
  ;({ createCategoriaRouter, categoriaAccessErrorHandler } = await load('categoria/categoria.routes.js'))
  ;({ createSessionMiddleware, SESSION_TTL_MS } = await load('shared/security/session.js'))
  ;({ getCsrfToken } = await load('shared/security/csrf.js'))
})

beforeEach(() => {
  process.env.SESSION_SECRET = 'secreto-ficticio-exclusivo-de-pruebas-de-categoria-1234567890'
  process.env.NODE_ENV = 'test'
  records = [
    { id: 1, nombre: 'Alimentos', categoriaPadre: null, subcategorias: [{ id: 2 }], productos: [{ id: 10, nombre: 'Pan' }] },
    { id: 2, nombre: 'Panificados', categoriaPadre: null, subcategorias: [{ id: 4 }], productos: [] },
    { id: 3, nombre: 'Bebidas', categoriaPadre: null, subcategorias: [], productos: [] },
    { id: 4, nombre: 'Pan', categoriaPadre: null, subcategorias: [], productos: [] },
  ]
  records[1].categoriaPadre = records[0]
  records[3].categoriaPadre = records[1]
  queries = []; assignments = []; events = []
  flushes = 0; commits = 0; rollbacks = 0; serviceCalls = 0
  beforeTransaction = undefined; transactionFailure = undefined
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
  assert.deepEqual(snapshot(), initial)
  assert.deepEqual(assignments, [], 'Una validación fallida no llega a assign')
  assert.equal(flushes, 0, 'Ni autoflush ni flush al rechazar la validación')
  assert.equal(commits, 0)
}
async function assertRejected(body, status = 400, id = 1) {
  const initial = snapshot()
  await assert.rejects(() => updateCategoria(id, body), error => error instanceof ServiceError && error.statusCode === status)
  assertUnchanged(initial)
}

for (const [input, expected] of [['  Almacén  ', 'Almacén'], ['Nombre con  espacios', 'Nombre con  espacios'], ['Alimentos', 'Alimentos']]) {
  test('servicio: nombre válido ' + JSON.stringify(input) + ' conserva el padre y las colecciones', async () => {
    const initial = snapshot(), products = records[0].productos, children = records[0].subcategorias
    const result = await updateCategoria(1, Object.freeze({ nombre: input }))
    assert.equal(result, records[0])
    assert.deepEqual(snapshot(), initial.map(row => row.id === 1 ? { ...row, nombre: expected } : row))
    assert.equal(result.productos, products); assert.equal(result.subcategorias, children)
    assert.deepEqual(assignments[0].input, { nombre: expected })
    assert.equal(flushes, 1); assert.deepEqual(events, [])
  })
}

test('servicio: PUT vacío conserva datos, respuesta y flujo sin transacción de jerarquía', async () => {
  const initial = snapshot()
  assert.equal(await updateCategoria(1, {}), records[0])
  assert.deepEqual(snapshot(), initial)
  assert.deepEqual(assignments[0].input, {})
  assert.equal(flushes, 1); assert.deepEqual(events, [])
})

test('servicio: cuerpos no objetos no modifican datos', async () => {
  for (const body of [null, undefined, [], ['nombre'], 'Alimentos', 1, true]) await assertRejected(body)
})
test('servicio: nombre inválido junto con un padre válido no inicia asignaciones', async () => {
  for (const nombre of ['', ' \t\n ', null, undefined, 1, true, {}, [], { nombre: 'Nuevo' }]) {
    await assertRejected({ nombre, categoriaPadre: 3 })
  }
  assert.deepEqual(events, [], 'El formato se valida antes de iniciar la transacción')
})

for (const [name, extra] of [
  ['id propio', { id: 1 }], ['otro id', { id: 2 }], ['productos vacíos', { productos: [] }],
  ['productos anidados', { productos: [{ id: 10, precio: 0 }] }], ['subcategorias', { subcategorias: [2] }],
  ['subcategorias anidadas', { subcategorias: [{ id: 2, categoriaPadre: 3 }] }], ['estado', { estado: true }],
  ['nombre del mock frontend', { name: 'Nuevo' }], ['adicional', { extra: true }],
  ['__proto__', JSON.parse('{"__proto__":{"nombre":"Otro"}}')],
  ['constructor', JSON.parse('{"constructor":{"prototype":{"nombre":"Otro"}}}')],
]) {
  test('servicio: rechaza ' + name + ' sin asignar campos válidos ni comenzar la transacción', async () => {
    await assertRejected({ nombre: 'Nuevo', categoriaPadre: 3, ...extra })
    assert.deepEqual(events, [])
  })
}

for (const padre of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3', '', true, undefined, NaN, Infinity, [], [3]]) {
  test('servicio: ID de padre inválido ' + String(padre) + ' no produce cambios parciales', async () => {
    await assertRejected({ nombre: 'Nuevo', categoriaPadre: padre })
    assert.deepEqual(events, [])
  })
}
for (const padre of [{}, { id: '3' }, { id: 0 }, { id: null }, { id: undefined }, { id: { id: 3 } },
  { id: 3, nombre: 'No asignar' }, { id: 3, categoriaPadre: 1 }, { id: 3, productos: [] }]) {
  test('servicio: referencia inválida ' + JSON.stringify(padre) + ' no alcanza assign ni la transacción', async () => {
    await assertRejected({ nombre: 'Nuevo', categoriaPadre: padre })
    assert.deepEqual(events, [])
  })
}

for (const padre of [3, Object.freeze({ id: 3 })]) {
  test('servicio: acepta ' + JSON.stringify(padre) + ', usa una entidad recargada y conserva descendientes y productos', async () => {
    const initial = snapshot(), input = Object.freeze({ nombre: '  Nuevo  ', categoriaPadre: padre })
    const result = await updateCategoria(1, input)
    assert.equal(result.nombre, 'Nuevo'); assert.equal(result.categoriaPadre.id, 3)
    assert.notEqual(assignments[0].input.categoriaPadre, padre)
    assert.equal(assignments[0].context, 'transaction')
    assert.deepEqual(snapshot(), initial.map(row => row.id === 1 ? { ...row, nombre: 'Nuevo', padre: 3 } : row))
    assert.equal(flushes, 1); assert.equal(commits, 1); assert.equal(rollbacks, 0)
    assert.deepEqual(events.map(event => event.operation), ['begin', 'lock', 'ids', 'lock', 'lock', 'lock', 'name', 'populate', 'assign', 'flush', 'commit'])
    assert.deepEqual(events.filter(event => event.operation === 'lock').map(event => event.id), [1, 2, 3, 4])
  })
}

test('servicio: null quita explícitamente el padre, conservando nombre, productos y descendientes', async () => {
  const initial = snapshot()
  const result = await updateCategoria(2, { categoriaPadre: null })
  assert.equal(result.categoriaPadre, null)
  assert.deepEqual(assignments[0].input, { categoriaPadre: null })
  assert.deepEqual(snapshot(), initial.map(row => row.id === 2 ? { ...row, padre: null } : row))
  assert.equal(commits, 1)
})
test('servicio: mantener el padre actual es válido y conservar el propio nombre no da conflicto', async () => {
  const initial = snapshot()
  await updateCategoria(2, { nombre: 'Panificados', categoriaPadre: { id: 1 } })
  assert.deepEqual(snapshot(), initial); assert.equal(commits, 1)
})
test('servicio: cambiar nombre solamente no altera la subcategoría existente', async () => {
  await updateCategoria(2, { nombre: '  Otra  ' })
  assert.equal(records[1].categoriaPadre, records[0])
  assert.deepEqual(assignments[0].input, { nombre: 'Otra' }); assert.deepEqual(events, [])
})
test('servicio: ID seguro máximo se valida como ID y da 404 si no existe', async () => {
  await assertRejected({ categoriaPadre: Number.MAX_SAFE_INTEGER }, 404)
})
test('servicio: padre inexistente da 404 y revierte la transacción sin assign ni flush', async () => {
  await assertRejected({ nombre: 'Nuevo', categoriaPadre: 999 }, 404)
  assert.equal(rollbacks, 1)
})
test('servicio: categoría inexistente conserva 404 incluso con cuerpo inválido', async () => {
  for (const body of [{}, null, { id: 1 }, { categoriaPadre: 3 }]) await assertRejected(body, 404, 999)
  assert.deepEqual(events, [])
})
test('servicio: nombre perteneciente a otra categoría da 409 sin modificar el padre', async () => {
  await assertRejected({ nombre: '  Bebidas  ' }, 409)
  await assertRejected({ nombre: '  Bebidas  ', categoriaPadre: 3 }, 409)
})
for (const padre of [1, 2, 4]) {
  test('servicio: rechaza con 409 el padre ' + padre + ' (sí misma, descendiente directo o indirecto)', async () => {
    await assertRejected({ nombre: 'Nuevo', categoriaPadre: padre }, 409)
    assert.equal(rollbacks, 1)
  })
}
test('servicio: detecta un ciclo preexistente en los antecesores sin repararlo', async () => {
  records[2].categoriaPadre = records[3]
  records[3].categoriaPadre = records[2]
  await assertRejected({ categoriaPadre: 3 }, 409)
  assert.equal(queries.filter(query => query.options?.lockMode).length, 4, 'El recorrido termina sin consultas infinitas')
})
test('servicio: detecta un padre ancestral ausente sin convertirlo silenciosamente en raíz', async () => {
  records[2].categoriaPadre = { id: 999 }
  await assertRejected({ categoriaPadre: 3 }, 409)
})
test('servicio: no impone límite de profundidad a una jerarquía válida', async () => {
  for (let id = 5; id <= 104; id++) records.push({ id, nombre: 'Nivel ' + id,
    categoriaPadre: id === 5 ? records[2] : records.at(-1), subcategorias: [], productos: [] })
  const initial = snapshot()
  await updateCategoria(1, { categoriaPadre: 104 })
  assert.deepEqual(snapshot(), initial.map(row => row.id === 1 ? { ...row, padre: 104 } : row))
  assert.equal(events.filter(event => event.operation === 'lock').length, 104)
})
test('servicio: un descendiente distante sigue dando 409', async () => {
  for (let id = 5; id <= 104; id++) records.push({ id, nombre: 'Nivel ' + id,
    categoriaPadre: records.at(-1), subcategorias: [], productos: [] })
  await assertRejected({ nombre: 'Nuevo', categoriaPadre: { id: 104 } }, 409)
})

test('transacción: revalida la cadena actualizada, no la cargada antes de bloquear', async () => {
  beforeTransaction = () => { records[2].categoriaPadre = records[0] }
  await assert.rejects(() => updateCategoria(1, { nombre: 'Nuevo', categoriaPadre: 3 }), error => error.statusCode === 409)
  assert.equal(records[0].nombre, 'Alimentos'); assert.equal(records[0].categoriaPadre, null)
  assert.equal(records[2].categoriaPadre, records[0], 'Conservar el cambio externo simulado')
  assert.deepEqual(assignments, []); assert.equal(flushes, 0); assert.equal(rollbacks, 1)
})
test('transacción: una categoría eliminada entre lectura y bloqueos vuelve a dar 404', async () => {
  beforeTransaction = () => { records = records.filter(row => row.id !== 1) }
  await assert.rejects(() => updateCategoria(1, { categoriaPadre: 3 }), error => error.statusCode === 404)
  assert.deepEqual(assignments, []); assert.equal(flushes, 0)
})
test('transacción: un padre eliminado entre lectura y bloqueos da 404', async () => {
  beforeTransaction = () => { records = records.filter(row => row.id !== 3) }
  await assert.rejects(() => updateCategoria(1, { nombre: 'Nuevo', categoriaPadre: 3 }), error => error.statusCode === 404)
  assert.equal(records[0].nombre, 'Alimentos'); assert.deepEqual(assignments, []); assert.equal(flushes, 0)
})
for (const failure of ['lock', 'populate']) {
  test('transacción: error al ' + failure + ' revierte sin asignar ni guardar', async () => {
    transactionFailure = failure
    const initial = snapshot()
    await assert.rejects(() => updateCategoria(1, { nombre: 'Nuevo', categoriaPadre: 3 }))
    assertUnchanged(initial); assert.equal(rollbacks, 1)
  })
}
test('transacción: un fallo al guardar no confirma cambios de nombre ni padre', async () => {
  transactionFailure = 'flush'
  const initial = snapshot()
  await assert.rejects(() => updateCategoria(1, { nombre: 'Nuevo', categoriaPadre: 3 }))
  assert.deepEqual(snapshot(), initial); assert.equal(commits, 0); assert.equal(rollbacks, 1)
  assert.equal(flushes, 1, 'Intento fallido simulado, no escritura confirmada')
})
test('transacción: una colisión UNIQUE al guardar da 409 y no confirma cambios', async () => {
  transactionFailure = 'unique'
  const initial = snapshot()
  await assert.rejects(() => updateCategoria(1, { nombre: 'Nuevo', categoriaPadre: 3 }), error =>
    error instanceof ServiceError && error.statusCode === 409 && !error.message.includes(internalDetail))
  assert.deepEqual(snapshot(), initial); assert.equal(commits, 0); assert.equal(rollbacks, 1)
})

test('MikroORM sin conexión: asignar una entidad validada o null conserva productos y descendientes', async t => {
  const entities = []
  for (const [name, path] of [['Admin', 'admin/admin.entity.js'], ['Cliente', 'cliente/cliente.entity.js'],
    ['Pedido', 'pedido/pedido.entity.js'], ['DetallePedido', 'pedido/detallePedido.entity.js'],
    ['MetodoPago', 'pedido/metodoPago.entity.js'], ['MetodoEnvio', 'pedido/metodoEnvio.entity.js'],
    ['Pago', 'pedido/pago.entity.js'], ['Producto', 'producto/producto.entity.js'], ['Categoria', 'categoria/categoria.entity.js']]) {
    entities.push((await import(new URL(path, compiledDir).href))[name])
  }
  const metadataOrm = new MikroORM({ entities, entitiesTs: [], metadataProvider: ReflectMetadataProvider,
    dbName: 'minigo_category_update_tests', clientUrl: 'mysql://test@127.0.0.1/minigo_category_update_tests',
    debug: false, metadataCache: { enabled: false }, extensions: [] })
  t.after(() => metadataOrm.close())
  const metadataEm = metadataOrm.em.fork()
  // Solo compilar SQL con el driver instalado; el contexto ficticio no abre transacciones reales.
  metadataEm.setTransactionContext({})
  const firstLockSql = metadataEm.createQueryBuilder(Categoria).select('*').orderBy({ id: 'asc' })
    .limit(1).setLockMode(LockMode.PESSIMISTIC_WRITE).getQuery()
  assert.match(firstLockSql, /order by .*`id` asc limit \? for update$/)
  const rowLockSql = metadataEm.createQueryBuilder(Categoria).select('*').where({ id: 3 })
    .setLockMode(LockMode.PESSIMISTIC_WRITE).getQuery()
  assert.match(rowLockSql, /where .*`id` = \? for update$/)
  metadataEm.resetTransactionContext()
  const current = metadataEm.create(Categoria, { id: 1, nombre: 'Alimentos' })
  const parent = metadataEm.create(Categoria, { id: 3, nombre: 'Bebidas' })
  const child = metadataEm.create(Categoria, { id: 2, nombre: 'Panificados', categoriaPadre: current })
  const Producto = entities.find(Entity => Entity.name === 'Producto')
  const product = metadataEm.create(Producto, { id: 10, nombre: 'Pan', descripcion: 'Ficticio', precio: 10, cantidad: 2, estado: true })
  current.subcategorias.set([child]); current.productos.set([product])
  metadataEm.assign(current, { categoriaPadre: parent })
  assert.equal(current.categoriaPadre, parent)
  metadataEm.assign(current, { categoriaPadre: null })
  assert.equal(current.categoriaPadre, null)
  assert.equal(child.categoriaPadre, current)
  assert.deepEqual(current.subcategorias.getItems(), [child]); assert.deepEqual(current.productos.getItems(), [product])
  metadataEm.persist(current)
  const uow = metadataEm.getUnitOfWork()
  uow.computeChangeSets() // Preparación en memoria: no ejecuta SQL.
  assert.equal(uow.getChangeSets().find(change => change.entity === current).payload.categoriaPadre, null)
})

async function harness(t) {
  const store = new session.MemoryStore(), app = express()
  app.use(express.json()); app.use('/api', createSessionMiddleware(store))
  // Solo servidor de prueba: identidades ficticias y tokens CSRF del módulo real.
  app.get('/api/test-session/:tipo', async (req, res) => {
    if (req.params.tipo !== 'anonimo') {
      req.session.identity = { id: 7, tipo: req.params.tipo }; req.session.authenticatedAt = Date.now()
    }
    res.json({ csrfToken: await getCsrfToken(req) })
  })
  app.use('/api/categorias', createCategoriaRouter({ allowedOrigins: [origin] }), categoriaAccessErrorHandler)
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
  const put = (current, body, id = 1) => call(`/api/categorias/${id}`, { ...current, method: 'PUT', body })
  return { store, call, fixture, put }
}

test('HTTP: admin y CSRF válidos conservan formato, parciales y PUT vacío', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin')
  for (const body of [{ nombre: '  Nuevo  ' }, {}, { categoriaPadre: 3 }, { categoriaPadre: null }, { categoriaPadre: { id: 3 } }]) {
    const response = await put(current, body)
    assert.equal(response.status, 200); assert.equal(response.body.message, 'categoria updated')
    assert.equal(response.body.data.id, 1); assert.equal(response.body.data.nombre, 'Nuevo')
    assert.deepEqual(response.body.data.productos, records[0].productos)
    assert.deepEqual(response.body.data.subcategorias, records[0].subcategorias)
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal(serviceCalls, 5); assert.equal(flushes, 5); assert.equal(commits, 3)
})
test('HTTP: formatos, IDs, objetos anidados y campos adicionales dan 400 sin escrituras', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = snapshot()
  for (const body of [null, [], { nombre: ' ' }, { nombre: { texto: 'Nuevo' } },
    { nombre: 'Nuevo', categoriaPadre: '3' }, { categoriaPadre: [3] }, { categoriaPadre: { id: 3, nombre: 'Otro' } },
    { categoriaPadre: { id: { id: 3 } } }, { nombre: 'Nuevo', id: 1 }, { productos: [] }, { subcategorias: [{ id: 2 }] }, { estado: true }]) {
    assert.equal((await put(current, body)).status, 400); assertUnchanged(initial)
  }
})
test('HTTP: conserva 404 para categoría o padre ausentes y 409 para duplicados y ciclos', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = snapshot()
  for (const [id, body, status] of [[999, {}, 404], [1, { categoriaPadre: 999 }, 404],
    [1, { nombre: 'Bebidas', categoriaPadre: 3 }, 409], [1, { categoriaPadre: 1 }, 409], [1, { categoriaPadre: 4 }, 409]]) {
    const response = await put(current, body, id)
    assert.equal(response.status, status); assert.deepEqual(Object.keys(response.body), ['message']); assertUnchanged(initial)
  }
})
for (const [actor, expected] of [['sin sesion', 401], ['anonimo', 401], ['cliente', 403]]) {
  test('HTTP: ' + actor + ' recibe ' + expected + ' sin llegar al servicio', async t => {
    const { fixture, put } = await harness(t), current = actor === 'sin sesion' ? {} : await fixture(actor), initial = snapshot()
    assert.equal((await put(current, { nombre: 'Nuevo', categoriaPadre: 3 })).status, expected)
    assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
  })
}
test('HTTP: admin vencido recibe 401 antes del CRUD', async t => {
  const { store, fixture, put } = await harness(t), current = await fixture('admin'), initial = snapshot()
  const stored = await new Promise((resolve, reject) => store.get(current.sid, (error, value) => error ? reject(error) : resolve(value)))
  stored.authenticatedAt = Date.now() - SESSION_TTL_MS - 1; stored.cookie.expires = new Date(Date.now() + SESSION_TTL_MS)
  await new Promise((resolve, reject) => store.set(current.sid, stored, error => error ? reject(error) : resolve()))
  assert.equal((await put(current, { categoriaPadre: 3 })).status, 401)
  assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
})
test('HTTP: CSRF ausente, alterado, de otra sesión y origen inválido dan 403 antes del servicio', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), other = await fixture('admin'), initial = snapshot()
  const altered = (current.token[0] === 'a' ? 'b' : 'a') + current.token.slice(1)
  for (const overrides of [{ token: undefined }, { token: altered }, { token: other.token },
    { sourceOrigin: undefined }, { sourceOrigin: 'https://evil.example' }]) {
    const response = await put({ ...current, ...overrides }, { nombre: 'Nuevo', categoriaPadre: 3 })
    assert.equal(response.status, 403); assert.equal(response.body.message, 'Solicitud CSRF inválida')
    assert.equal(serviceCalls, 0); assert.deepEqual(queries, []); assertUnchanged(initial)
  }
})
test('HTTP: errores internos al bloquear son genéricos y no revelan SQL, hashes, cookies, secretos o rutas', async t => {
  const { fixture, put } = await harness(t), current = await fixture('admin'), initial = snapshot()
  transactionFailure = 'lock'
  const response = await put(current, { nombre: 'Nuevo', categoriaPadre: 3 })
  assert.equal(response.status, 500); assert.deepEqual(response.body, { message: 'No se pudo procesar la solicitud' })
  assertUnchanged(initial)
})
