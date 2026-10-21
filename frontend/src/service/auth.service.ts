import type { AuthIdentity, LoginCredentials, RegisterClientData } from '../type/authType';

export class AuthError extends Error {
  readonly status: number | undefined;
  readonly kind: 'http' | 'network' | 'response';

  constructor(message: string, kind: AuthError['kind'], status?: number) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
    this.status = status;
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function leerIdentidad(valor: unknown): AuthIdentity {
  if (!esObjeto(valor) || typeof valor.id !== 'number' || !Number.isSafeInteger(valor.id)
    || valor.id <= 0 || (valor.tipo !== 'cliente' && valor.tipo !== 'admin')) {
    throw new AuthError('El servidor devolvió una identidad inválida.', 'response');
  }
  // La respuesta puede contener otros campos; la aplicación conserva solo la identidad pública.
  return { id: valor.id, tipo: valor.tipo };
}

function leerTokenCsrf(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-f0-9]{64}$/.test(valor)) {
    throw new AuthError('No se pudo preparar la protección de la solicitud.', 'response');
  }
  return valor;
}

function mensajeHttp(status: number, esRegistro = false, esEliminacion = false): string {
  if (esEliminacion && status === 409) return 'No podés eliminar tu cuenta porque tiene pedidos u otros registros asociados.';
  if (esEliminacion && status === 401) return 'Tu sesión ya no está disponible. Volvé a iniciar sesión.';
  if (esEliminacion && status >= 500) return 'No se pudo confirmar la eliminación. Comprobá tu sesión antes de reintentar.';
  if (status === 400) return esRegistro
    ? 'Revisá los datos ingresados para crear la cuenta.'
    : 'Revisá el correo, la contraseña y el tipo de cuenta.';
  if (status === 409 && esRegistro) return 'Ya existe una cuenta con esos datos.';
  if (status === 401) return 'Correo, contraseña o tipo de cuenta incorrectos.';
  if (status === 403) return 'No se pudo validar la solicitud. Volvé a intentarlo.';
  return 'No se pudo completar la operación. Intentá nuevamente más tarde.';
}

/** Permite probar con fetch simulado; cada escritura consulta el token vigente. */
export function createAuthService(realizarFetch: typeof fetch = (...args) => fetch(...args)) {
  async function solicitarJson(ruta: string, opciones: RequestInit = {}, estadoEsperado?: number): Promise<unknown> {
    const esEliminacion = opciones.method === 'DELETE' && ruta.startsWith('/api/clientes/');
    let respuesta: Response;
    try {
      respuesta = await realizarFetch(ruta, {
        ...opciones, credentials: 'include', cache: 'no-store',
      });
    } catch {
      throw new AuthError(esEliminacion
        ? 'Se perdió la conexión. No se pudo confirmar la eliminación; comprobá tu sesión antes de reintentar.'
        : 'No se pudo conectar con el servidor. Verificá que esté disponible.', 'network');
    }
    // No se muestran mensajes arbitrarios del servidor ni cuerpos de error HTML.
    if (!respuesta.ok) throw new AuthError(mensajeHttp(respuesta.status, ruta === '/api/clientes', esEliminacion), 'http', respuesta.status);
    if (estadoEsperado !== undefined && respuesta.status !== estadoEsperado) {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
    try {
      return await respuesta.json();
    } catch {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function getCsrfToken(): Promise<string> {
    const resultado = await solicitarJson('/api/auth/csrf');
    return leerTokenCsrf(esObjeto(resultado) ? resultado.csrfToken : undefined);
  }

  async function login(credenciales: LoginCredentials): Promise<AuthIdentity> {
    const token = await getCsrfToken();
    const resultado = await solicitarJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({
        mail: credenciales.mail.trim().toLowerCase(),
        password: credenciales.password,
        tipo: credenciales.tipo,
      }),
    });
    const identidad = leerIdentidad(esObjeto(resultado) ? resultado.data : undefined);
    // Se conserva el contrato del token renovado; la próxima escritura volverá a consultarlo.
    leerTokenCsrf(esObjeto(resultado) ? resultado.csrfToken : undefined);
    return identidad;
  }

  async function registerCliente(datos: RegisterClientData): Promise<void> {
    const token = await getCsrfToken();
    const resultado = await solicitarJson('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      // Seleccionar los campos evita enviar confirmaciones, roles u otros datos del formulario.
      body: JSON.stringify({
        nombre: datos.nombre.trim(),
        apellido: datos.apellido.trim(),
        dni: datos.dni,
        direccion: datos.direccion.trim(),
        telefono: datos.telefono.trim(),
        mail: datos.mail.trim().toLowerCase(),
        password: datos.password,
      }),
    }, 201);
    if (!esObjeto(resultado) || typeof resultado.message !== 'string' || !esObjeto(resultado.data)
      || typeof resultado.data.id !== 'number' || !Number.isSafeInteger(resultado.data.id) || resultado.data.id <= 0) {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
    // Crear una cuenta no inicia sesión: no se guarda identidad ni se consulta /me.
  }

  async function me(): Promise<AuthIdentity | null> {
    try {
      const resultado = await solicitarJson('/api/auth/me');
      return leerIdentidad(esObjeto(resultado) ? resultado.data : undefined);
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        return null;
      }
      throw error;
    }
  }

  async function logout(): Promise<void> {
    // También funciona después de recargar, cuando solo el navegador conserva la cookie.
    const token = await getCsrfToken();
    const resultado = await solicitarJson('/api/auth/logout', {
      method: 'POST', headers: { 'X-CSRF-Token': token },
    });
    if (!esObjeto(resultado) || typeof resultado.message !== 'string') {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function deleteCliente(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AuthError('La identidad de la cuenta no es válida.', 'response');
    }
    const token = await getCsrfToken();
    const resultado = await solicitarJson(`/api/clientes/${id}`, {
      method: 'DELETE', headers: { 'X-CSRF-Token': token },
    }, 200);
    if (!esObjeto(resultado) || resultado.message !== 'cliente deleted') {
      throw new AuthError('No se pudo confirmar la eliminación. Comprobá tu sesión.', 'response');
    }
  }

  return { getCsrfToken, login, registerCliente, me, logout, deleteCliente };
}

export const authService = createAuthService();
