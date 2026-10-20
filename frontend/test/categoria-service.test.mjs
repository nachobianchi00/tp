import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { CategoriaError, createCategoriaService } from '../src/service/categoria.service.ts';

// Desde frontend/: node --test test/categoria-service.test.mjs (Node 24).
// Respuestas simuladas: no se abre Express, Vite ni ninguna conexión de red o MySQL.
let networkGuard;

before(() => {
  networkGuard = mock.method(globalThis, 'fetch', () => {
    throw new Error('Estas pruebas no permiten conexiones reales');
  });
});
after(() => {
  try { assert.equal(networkGuard.mock.callCount(), 0); } finally { networkGuard.mock.restore(); }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function simulated(...responses) {
  const calls = [];
  const service = createCategoriaService(async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.length, 'No debe haber solicitudes adicionales ni reintentos automáticos');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { service, calls };
}

test('getAll pide /api/categorias con cookies, sin caché y sin método de escritura', async () => {
  const { service, calls } = simulated(json({ message: 'found all categorias', data: [] }));
  assert.deepEqual(await service.getAll(), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/categorias');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, undefined);
});

test('getAll convierte nombre a name y conserva el orden', async () => {
  const { service } = simulated(json({ data: [
    { id: 1, nombre: '[DEV] Alimentos' },
    { id: 2, nombre: '[DEV] Bebidas' },
  ] }));
  assert.deepEqual(await service.getAll(), [
    { id: 1, name: '[DEV] Alimentos' },
    { id: 2, name: '[DEV] Bebidas' },
  ]);
});

test('getAll descarta subcategorías, productos y otros datos que devuelve el backend', async () => {
  const { service } = simulated(json({ data: [{
    id: 1, nombre: 'Almacén', categoriaPadre: null,
    subcategorias: [{ id: 2, nombre: 'Snacks' }], productos: [{ id: 9, nombre: 'Mani' }],
  }] }));
  const [category] = await service.getAll();
  assert.deepEqual(category, { id: 1, name: 'Almacén' });
  assert.deepEqual(Object.keys(category).sort(), ['id', 'name']);
});

for (const data of [undefined, null, {}, 'texto', 7]) {
  test(`getAll rechaza una respuesta sin lista de categorías: ${JSON.stringify(data)}`, async () => {
    const { service } = simulated(json({ data }));
    await assert.rejects(service.getAll(), error => error instanceof CategoriaError && error.kind === 'response');
  });
}

for (const bad of [null, [], {}, { id: '1', nombre: 'Mal' }, { id: 1, nombre: 5 }, { id: 1 }, { nombre: 'Sin id' }]) {
  test(`getAll rechaza una categoría inválida: ${JSON.stringify(bad)}`, async () => {
    const { service } = simulated(json({ data: [bad] }));
    await assert.rejects(service.getAll(), error => error instanceof CategoriaError && error.kind === 'response');
  });
}

for (const status of [400, 404, 500, 502]) {
  test(`un error ${status} conserva el estado y no expone detalles internos`, async () => {
    const { service } = simulated(json({ message: 'SQL SELECT password secreto-ficticio /ruta/interna' }, status));
    await assert.rejects(service.getAll(), error => error instanceof CategoriaError
      && error.kind === 'http' && error.status === status
      && !/SQL|password|secreto-ficticio|ruta\/interna/.test(error.message));
  });
}

test('un error HTTP con HTML conserva el estado sin exponer su contenido', async () => {
  const { service } = simulated(new Response('ruta-servidor-ficticia', { status: 502 }));
  await assert.rejects(service.getAll(), error => error instanceof CategoriaError
    && error.status === 502 && !error.message.includes('ruta-servidor'));
});

test('un fallo de conexión se informa como error de red sin repetir la solicitud', async () => {
  const { service, calls } = simulated(new TypeError('detalle de red ficticio'));
  await assert.rejects(service.getAll(), error => error instanceof CategoriaError
    && error.kind === 'network' && error.status === undefined && !error.message.includes('detalle de red'));
  assert.equal(calls.length, 1);
});

test('una respuesta exitosa sin JSON se informa como error de respuesta', async () => {
  const { service } = simulated(new Response('<html>respuesta inesperada</html>'));
  await assert.rejects(service.getAll(), error => error instanceof CategoriaError && error.kind === 'response');
});

test('las instancias del servicio no comparten estado', async () => {
  const first = simulated(json({ data: [{ id: 1, nombre: 'Primera' }] }));
  const second = simulated(json({ data: [{ id: 2, nombre: 'Segunda' }] }));
  assert.deepEqual(await first.service.getAll(), [{ id: 1, name: 'Primera' }]);
  assert.deepEqual(await second.service.getAll(), [{ id: 2, name: 'Segunda' }]);
});