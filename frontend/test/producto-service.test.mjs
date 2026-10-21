import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { ProductoError, createProductoService } from '../src/service/producto.service.ts';

// Desde frontend/: node --test test/producto-service.test.mjs (Node 24).
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
  const service = createProductoService(async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.length, 'No debe haber solicitudes adicionales ni reintentos automáticos');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { service, calls };
}

const backendProduct = {
  id: 1, nombre: '[DEV] Agua 500 ml', descripcion: 'Agua', precio: 1000, cantidad: 20, estado: true,
  categorias: [{ id: 4, nombre: '[DEV] Alimentos' }],
};

test('getAll pide /api/productos con cookies, sin caché y sin método de escritura', async () => {
  const { service, calls } = simulated(json({ message: 'found all productos', data: [] }));
  assert.deepEqual(await service.getAll(), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/productos');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, undefined);
});

test('getAll convierte los campos del backend al tipo de la interfaz', async () => {
  const { service } = simulated(json({ data: [backendProduct] }));
  assert.deepEqual(await service.getAll(), [{
    id: 1,
    name: '[DEV] Agua 500 ml',
    price: 1000,
    stock: 20,
    image: `https://placehold.co/300x300?text=${encodeURIComponent('[DEV] Agua 500 ml')}`,
    category: { id: 4, name: '[DEV] Alimentos' },
  }]);
});

test('getAll usa la primera categoría cuando el producto tiene varias', async () => {
  const { service } = simulated(json({ data: [{
    ...backendProduct, categorias: [{ id: 4, nombre: 'Primera' }, { id: 5, nombre: 'Segunda' }],
  }] }));
  const [product] = await service.getAll();
  assert.deepEqual(product.category, { id: 4, name: 'Primera' });
});

for (const categorias of [undefined, null, [], [null], [{ id: 'x', nombre: 'Mal' }], [{ id: 4 }]]) {
  test(`getAll marca "Sin categoría" ante categorías ausentes o inválidas: ${JSON.stringify(categorias)}`, async () => {
    const { service } = simulated(json({ data: [{ ...backendProduct, categorias }] }));
    const [product] = await service.getAll();
    assert.deepEqual(product.category, { id: 0, name: 'Sin categoría' });
  });
}

test('getAll oculta los productos con estado en false y conserva el resto', async () => {
  const { service } = simulated(json({ data: [
    backendProduct,
    { ...backendProduct, id: 2, nombre: 'Oculto', estado: false },
    { ...backendProduct, id: 3, nombre: 'Visible' },
  ] }));
  assert.deepEqual((await service.getAll()).map(p => p.id), [1, 3]);
});

for (const data of [undefined, null, {}, 'texto', 7]) {
  test(`getAll rechaza una respuesta sin lista de productos: ${JSON.stringify(data)}`, async () => {
    const { service } = simulated(json({ data }));
    await assert.rejects(service.getAll(), error => error instanceof ProductoError && error.kind === 'response');
  });
}

for (const bad of [null, [], {}, { ...backendProduct, id: '1' }, { ...backendProduct, nombre: 5 },
  { ...backendProduct, precio: '1000' }, { ...backendProduct, cantidad: undefined }]) {
  test(`getAll rechaza un producto inválido: ${JSON.stringify(bad)}`, async () => {
    const { service } = simulated(json({ data: [bad] }));
    await assert.rejects(service.getAll(), error => error instanceof ProductoError && error.kind === 'response');
  });
}

test('getById pide /api/productos/:id y convierte el producto', async () => {
  const { service, calls } = simulated(json({ message: 'found producto', data: backendProduct }));
  const product = await service.getById(1);
  assert.equal(calls[0].url, '/api/productos/1');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(product.id, 1);
  assert.equal(product.name, '[DEV] Agua 500 ml');
  assert.equal(product.stock, 20);
});

for (const data of [undefined, null, [], {}]) {
  test(`getById rechaza un cuerpo sin producto válido: ${JSON.stringify(data)}`, async () => {
    const { service } = simulated(json({ data }));
    await assert.rejects(service.getById(1), error => error instanceof ProductoError && error.kind === 'response');
  });
}

test('getById informa un 404 con mensaje claro y conserva el estado', async () => {
  const { service } = simulated(json({ message: 'producto not found' }, 404));
  await assert.rejects(service.getById(9999), error => error instanceof ProductoError
    && error.kind === 'http' && error.status === 404 && error.message === 'No se encontró el producto.');
});

for (const status of [400, 500, 502]) {
  test(`un error ${status} no expone detalles internos del servidor`, async () => {
    const { service } = simulated(json({ message: 'SQL SELECT password secreto-ficticio /ruta/interna' }, status));
    await assert.rejects(service.getAll(), error => error instanceof ProductoError
      && error.kind === 'http' && error.status === status
      && !/SQL|password|secreto-ficticio|ruta\/interna/.test(error.message));
  });
}

test('un error HTTP con HTML conserva el estado sin exponer su contenido', async () => {
  const { service } = simulated(new Response('ruta-servidor-ficticia', { status: 502 }));
  await assert.rejects(service.getAll(), error => error instanceof ProductoError
    && error.status === 502 && !error.message.includes('ruta-servidor'));
});

test('un fallo de conexión se informa como error de red sin repetir la solicitud', async () => {
  const { service, calls } = simulated(new TypeError('detalle de red ficticio'));
  await assert.rejects(service.getAll(), error => error instanceof ProductoError
    && error.kind === 'network' && error.status === undefined && !error.message.includes('detalle de red'));
  assert.equal(calls.length, 1);
});

test('una respuesta exitosa sin JSON se informa como error de respuesta', async () => {
  const { service } = simulated(new Response('<html>respuesta inesperada</html>'));
  await assert.rejects(service.getAll(), error => error instanceof ProductoError && error.kind === 'response');
});