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

const clientData = {
  nombre: '  Ana  ', apellido: '  Prueba  ', dni: 12345678,
  direccion: '  Calle ficticia 123  ', telefono: '  +54 341 1234567  ',
  mail: '  CLIENTE@example.com  ', password: '  Clave ficticia ñ 123!  ',
};
const createdClient = { message: 'cliente created', data: { id: 12, nombre: 'Ana' } };

test('registro 201: obtiene CSRF y envía solo los siete campos, con cookies y contraseña original', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json(createdClient, 201));
  assert.equal(await service.registerCliente({ ...clientData, confirmPassword: clientData.password, tipo: 'admin', id: 999 }), undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/auth/csrf');
  assert.equal(calls[1].url, '/api/clientes');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], anonymousToken);
  assert.ok(calls.every(call => call.options.credentials === 'include' && call.options.cache === 'no-store'));
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    nombre: 'Ana', apellido: 'Prueba', dni: 12345678,
    direccion: 'Calle ficticia 123', telefono: '+54 341 1234567',
    mail: 'cliente@example.com', password: clientData.password,
  });
  // El registro no regenera la sesión ni entrega identidad: conserva el token existente.
  assert.equal(await service.getCsrfToken(), anonymousToken);
  assert.equal(calls.length, 2);
});

test('registro obtiene un token vigente aunque ya exista uno en memoria', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json({ csrfToken: renewedToken }),
    json(createdClient, 201));
  await service.getCsrfToken();
  await service.registerCliente(clientData);
  assert.equal(calls[2].options.headers['X-CSRF-Token'], renewedToken);
});

test('registro no transforma el objeto recibido ni conserva los datos de la cuenta', async () => {
  const input = Object.freeze({ ...clientData });
  const { service } = simulated(json({ csrfToken: anonymousToken }),
    json({ ...createdClient, data: { id: 12, password: 'hash-ficticio', mail: 'privado@example.com' } }, 201));
  assert.equal(await service.registerCliente(input), undefined);
  assert.deepEqual(input, clientData);
});

for (const password of ['a', '  á ñ 🙂  ', '密码']) {
  test(`registro envía sin transformar una contraseña válida: ${JSON.stringify(password)}`, async () => {
    const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json(createdClient, 201));
    await service.registerCliente({ ...clientData, password });
    assert.equal(JSON.parse(calls[1].options.body).password, password);
  });
}

for (const status of [400, 409, 403, 500]) {
  test(`registro ${status}: mensaje seguro, token descartado y ninguna repetición del POST`, async () => {
    const { service, calls } = simulated(json({ csrfToken: anonymousToken }),
      json({ message: 'SQL password cookie secreto-ficticio /ruta/interna' }, status),
      json({ csrfToken: renewedToken }));
    await assert.rejects(service.registerCliente(clientData), error => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.kind, 'http');
      assert.equal(error.status, status);
      assert.ok(!/SQL|password|cookie|secreto-ficticio|ruta\/interna/.test(error.message));
      if (status === 400) assert.equal(error.message, 'Revisá los datos ingresados para crear la cuenta.');
      if (status === 409) assert.equal(error.message, 'Ya existe una cuenta con esos datos.');
      return true;
    });
    assert.equal(calls.length, 2);
    assert.equal(await service.getCsrfToken(), renewedToken);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  });
}

for (const csrfToken of [undefined, null, '', 'manipulado', 'f'.repeat(63), 'g'.repeat(64)]) {
  test(`CSRF inválido impide enviar el registro: ${String(csrfToken)}`, async () => {
    const { service, calls } = simulated(json({ csrfToken }));
    await assert.rejects(service.registerCliente(clientData), AuthError);
    assert.equal(calls.length, 1);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
  });
}

test('fallo de conexión al obtener CSRF impide enviar el registro', async () => {
  const { service, calls } = simulated(new TypeError('fallo ficticio de conexión'));
  await assert.rejects(service.registerCliente(clientData), error => error instanceof AuthError && error.kind === 'network');
  assert.equal(calls.length, 1);
});

test('CSRF rechazado impide enviar los datos de registro', async () => {
  const { service, calls } = simulated(json({ message: 'Solicitud CSRF inválida' }, 403));
  await assert.rejects(service.registerCliente(clientData), error => error.status === 403);
  assert.equal(calls.length, 1);
});

test('una respuesta perdida del registro no provoca otra escritura', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), new TypeError('respuesta perdida ficticia'),
    json({ csrfToken: renewedToken }));
  await assert.rejects(service.registerCliente(clientData), error => error instanceof AuthError && error.kind === 'network');
  assert.equal(calls.length, 2);
  assert.equal(await service.getCsrfToken(), renewedToken);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
});

for (const body of [null, [], {}, { message: 'cliente created' },
  { message: 'cliente created', data: { id: '12' } }, { message: 'cliente created', data: { id: 0 } }]) {
  test(`registro rechaza un 201 con cuerpo inválido: ${JSON.stringify(body)}`, async () => {
    const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json(body, 201));
    await assert.rejects(service.registerCliente(clientData), error => error instanceof AuthError && error.kind === 'response');
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
  });
}

for (const status of [200, 202, 204]) {
  test(`registro no confunde un ${status} con la creación 201 esperada`, async () => {
    const response = status === 204 ? new Response(null, { status }) : json(createdClient, status);
    const { service } = simulated(json({ csrfToken: anonymousToken }), response);
    await assert.rejects(service.registerCliente(clientData), error => error instanceof AuthError && error.kind === 'response');
  });
}

test('registro no considera éxito una respuesta 201 con HTML', async () => {
  const { service } = simulated(json({ csrfToken: anonymousToken }), new Response('<html>detalle interno</html>', { status: 201 }));
  await assert.rejects(service.registerCliente(clientData), error => error instanceof AuthError
    && error.kind === 'response' && !error.message.includes('detalle interno'));
});

test('registro anónimo no inicia sesión automáticamente', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }), json(createdClient, 201),
    json({ message: 'No autenticado' }, 401));
  await service.registerCliente(clientData);
  assert.equal(calls.length, 2);
  assert.equal(calls.filter(call => call.url === '/api/auth/login' || call.url === '/api/auth/me').length, 0);
  assert.equal(await service.me(), null);
});

test('registrar un Cliente desde una sesión Admin no altera el login ni el logout existentes', async () => {
  const { service, calls } = simulated(json({ csrfToken: anonymousToken }),
    json({ data: { id: 7, tipo: 'admin' }, csrfToken: authenticatedToken }),
    json({ csrfToken: renewedToken }), json(createdClient, 201),
    json({ data: { id: 7, tipo: 'admin' } }), json({ csrfToken: authenticatedToken }),
    json({ message: 'Sesión cerrada' }), json({ csrfToken: anonymousToken }));
  await service.login({ ...credentials, tipo: 'admin' });
  await service.registerCliente(clientData);
  assert.equal(calls[3].options.headers['X-CSRF-Token'], renewedToken);
  assert.deepEqual(await service.me(), { id: 7, tipo: 'admin' });
  await service.logout();
  assert.equal(await service.getCsrfToken(), anonymousToken);
  assert.equal(calls.filter(call => call.url === '/api/auth/login').length, 1);
});
