import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { AuthError, createAuthService } from '../src/service/auth.service.ts';

// Desde frontend/: node --test test/auth-service.test.mjs (Node 24).
// Respuestas simuladas: no se abre Express, Vite ni ninguna conexión de red o MySQL.
const anonymousToken = 'a'.repeat(64);
const authenticatedToken = 'b'.repeat(64);
const renewedToken = 'c'.repeat(64);
const credentials = { mail: '  CLIENTE@example.com  ', password: '  Clave ficticia ñ 123!  ', tipo: 'cliente' };
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
  const service = createAuthService(async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.length, 'No debe haber solicitudes adicionales ni reintentos automáticos');
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { service, calls };
}

for (const tipo of ['cliente', 'admin']) {
  test(`me devuelve solo ID y tipo para ${tipo}, aunque el servidor incluya otros datos`, async () => {
    const { service, calls } = simulated(json({ data: { id: 7, tipo, password: 'hash-ficticio', mail: 'privado@example.com' } }));
    assert.deepEqual(await service.me(), { id: 7, tipo });
    assert.equal(calls[0].url, '/api/auth/me');
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[0].options.cache, 'no-store');
  });
}

test('me devuelve null únicamente ante 401', async () => {
  const { service } = simulated(json({ message: 'No autenticado' }, 401));
  assert.equal(await service.me(), null);
});

test('me distingue una conexión fallida de una sesión ausente', async () => {
  const { service } = simulated(new TypeError('detalle de red ficticio'));
  await assert.rejects(service.me(), error => error instanceof AuthError
    && error.kind === 'network' && error.status === undefined && !error.message.includes('detalle de red'));
});

test('me no interpreta un 500 como logout y oculta el mensaje interno', async () => {
  const { service } = simulated(json({ message: 'SQL SELECT password, secreto-ficticio' }, 500));
  await assert.rejects(service.me(), error => error instanceof AuthError
    && error.status === 500 && !/SQL|password|secreto-ficticio/.test(error.message));
});

for (const data of [null, [], {}, { id: 0, tipo: 'cliente' }, { id: -1, tipo: 'cliente' },
  { id: 1.5, tipo: 'cliente' }, { id: Number.MAX_SAFE_INTEGER + 1, tipo: 'cliente' },
  { id: '7', tipo: 'cliente' }, { id: 7, tipo: 'otro' }]) {
  test(`me rechaza identidad inválida: ${JSON.stringify(data)}`, async () => {
    const { service } = simulated(json({ data }));
    await assert.rejects(service.me(), error => error instanceof AuthError && error.kind === 'response');
  });
}

test('una respuesta exitosa sin JSON se informa como error de respuesta', async () => {
  const { service } = simulated(new Response('<html>respuesta inesperada</html>'));
  await assert.rejects(service.me(), error => error instanceof AuthError && error.kind === 'response');
});

test('un error HTTP con HTML conserva el estado sin exponer su contenido', async () => {
  const { service } = simulated(new Response('ruta-servidor-ficticia', { status: 502 }));
  await assert.rejects(service.me(), error => error instanceof AuthError
    && error.status === 502 && !error.message.includes('ruta-servidor'));
});

test('el token se conserva en memoria, y refresh consulta otro válido', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json({ csrfToken: renewedToken }));
  assert.equal(await service.getCsrfToken(), anonymousToken);
  assert.equal(await service.getCsrfToken(), anonymousToken);
  assert.equal(calls.length, 1);
  assert.equal(await service.getCsrfToken(true), renewedToken);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, 'include');
});

for (const tipo of ['cliente', 'admin']) {
  test(`login ${tipo}: pide CSRF, envía credenciales y reemplaza el token anónimo`, async () => {
    const { service, calls } = simulated(json({ csrfToken: anonymousToken }),
      json({ data: { id: 7, tipo }, csrfToken: authenticatedToken }));
    assert.deepEqual(await service.login({ ...credentials, tipo }), { id: 7, tipo });
    assert.equal(calls[0].url, '/api/auth/csrf');
    assert.equal(calls[1].url, '/api/auth/login');
    assert.equal(calls[1].options.method, 'POST');
    assert.equal(calls[1].options.credentials, 'include');
    assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
    assert.equal(calls[1].options.headers['X-CSRF-Token'], anonymousToken);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      mail: 'cliente@example.com', password: credentials.password, tipo,
    });
    assert.equal(await service.getCsrfToken(), authenticatedToken);
    assert.equal(calls.length, 2);
  });
}

test('login obtiene un token fresco aunque exista uno en memoria', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json({ csrfToken: renewedToken }),
    json({ data: { id: 7, tipo: 'cliente' }, csrfToken: authenticatedToken }));
  await service.getCsrfToken();
  await service.login(credentials);
  assert.equal(calls[2].options.headers['X-CSRF-Token'], renewedToken);
});

for (const csrfToken of [undefined, null, '', 'manipulado', 'f'.repeat(63), 'g'.repeat(64)]) {
  test(`CSRF inválido impide enviar el login: ${String(csrfToken)}`, async () => {
    const { service, calls } = simulated(json({ csrfToken }));
    await assert.rejects(service.login(credentials), AuthError);
    assert.equal(calls.length, 1);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
  });
}

test('fallar al obtener CSRF impide enviar credenciales', async () => {
  const { service, calls } = simulated(new TypeError('sin conexión ficticia'));
  await assert.rejects(service.login(credentials), error => error.kind === 'network');
  assert.equal(calls.length, 1);
});

for (const status of [400, 401, 403, 500]) {
  test(`login ${status}: informa error, descarta el token y no repite el POST`, async () => {
    const { service, calls } = simulated(json({ csrfToken: anonymousToken }),
      json({ message: 'detalle interno ficticio' }, status), json({ csrfToken: renewedToken }));
    await assert.rejects(service.login(credentials), error => error instanceof AuthError
      && error.status === status && !error.message.includes('detalle interno'));
    assert.equal(calls.length, 2);
    assert.equal(await service.getCsrfToken(), renewedToken);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  });
}

test('login no concede identidad si falta el token renovado', async () => {
  const { service } = simulated(json({ csrfToken: anonymousToken }), json({ data: { id: 7, tipo: 'cliente' } }));
  await assert.rejects(service.login(credentials), error => error.kind === 'response');
});

test('la pérdida de respuesta del login no dispara otro POST', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), new TypeError('respuesta perdida ficticia'));
  await assert.rejects(service.login(credentials), error => error.kind === 'network');
  assert.equal(calls.length, 2);
});

test('logout obtiene CSRF sin necesitar un login previo en esta instancia', async () => {
  const { service, calls } = simulated(json({ csrfToken: authenticatedToken }),
    json({ message: 'Sesión cerrada' }), json({ csrfToken: renewedToken }));
  await service.logout();
  assert.equal(calls[0].url, '/api/auth/csrf');
  assert.equal(calls[1].url, '/api/auth/logout');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], authenticatedToken);
  assert.equal(await service.getCsrfToken(), renewedToken);
  assert.equal(calls.length, 3);
});

test('recorrido login → me → logout conserva la cookie y renueva/descarta tokens', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }),
    json({ data: { id: 7, tipo: 'cliente' }, csrfToken: authenticatedToken }),
    json({ data: { id: 7, tipo: 'cliente' } }), json({ csrfToken: authenticatedToken }),
    json({ message: 'Sesión cerrada' }), json({ message: 'No autenticado' }, 401));
  await service.login(credentials);
  assert.deepEqual(await service.me(), { id: 7, tipo: 'cliente' });
  await service.logout();
  assert.equal(await service.me(), null);
  assert.equal(calls[4].options.headers['X-CSRF-Token'], authenticatedToken);
  assert.ok(calls.every(call => call.options.credentials === 'include'));
});

test('CSRF rechazado al cerrar sesión no dispara ningún POST', async () => {
  const { service, calls } = simulated(json({ message: 'Solicitud CSRF inválida' }, 403));
  await assert.rejects(service.logout(), error => error.status === 403);
  assert.equal(calls.length, 1);
});

test('logout rechazado no informa éxito ni repite escrituras', async () => {
  const { service, calls } = simulated(json({ csrfToken: authenticatedToken }),
    json({ message: 'Solicitud CSRF inválida' }, 403), json({ csrfToken: renewedToken }));
  await assert.rejects(service.logout(), error => error.status === 403);
  assert.equal(calls.length, 2);
  assert.equal(await service.getCsrfToken(), renewedToken);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
});

test('logout sin conexión no se confunde con cierre exitoso', async () => {
  const { service } = simulated(json({ csrfToken: authenticatedToken }), new TypeError('sin conexión ficticia'));
  await assert.rejects(service.logout(), error => error.kind === 'network');
});

test('un 401 de me descarta el token anterior', async () => {
  const { service, calls } = simulated(json({ csrfToken: authenticatedToken }),
    json({ message: 'No autenticado' }, 401), json({ csrfToken: renewedToken }));
  await service.getCsrfToken();
  assert.equal(await service.me(), null);
  assert.equal(await service.getCsrfToken(), renewedToken);
  assert.equal(calls.length, 3);
});

test('las instancias de servicio no comparten tokens', async () => {
  const first = simulated(json({ csrfToken: anonymousToken }));
  const second = simulated(json({ csrfToken: authenticatedToken }));
  assert.equal(await first.service.getCsrfToken(), anonymousToken);
  assert.equal(await second.service.getCsrfToken(), authenticatedToken);
});
