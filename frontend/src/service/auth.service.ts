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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identityFrom(value: unknown): AuthIdentity {
  if (!isRecord(value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id)
    || value.id <= 0 || (value.tipo !== 'cliente' && value.tipo !== 'admin')) {
    throw new AuthError('El servidor devolvió una identidad inválida.', 'response');
  }
  // La respuesta puede contener otros campos; la aplicación conserva solo la identidad pública.
  return { id: value.id, tipo: value.tipo };
}

function tokenFrom(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new AuthError('No se pudo preparar la protección de la solicitud.', 'response');
  }
  return value;
}

function httpMessage(status: number, registration = false): string {
  if (status === 400) return registration
    ? 'Revisá los datos ingresados para crear la cuenta.'
    : 'Revisá el correo, la contraseña y el tipo de cuenta.';
  if (status === 409 && registration) return 'Ya existe una cuenta con esos datos.';
  if (status === 401) return 'Correo, contraseña o tipo de cuenta incorrectos.';
  if (status === 403) return 'No se pudo validar la solicitud. Volvé a intentarlo.';
  return 'No se pudo completar la operación. Intentá nuevamente más tarde.';
}

/** Permite probar con fetch simulado; el token vive únicamente en esta instancia, en memoria. */
export function createAuthService(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let csrfToken: string | null = null;

  async function request(path: string, options: RequestInit = {}, expectedStatus?: number): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(path, {
        ...options, credentials: 'include', cache: 'no-store',
      });
    } catch {
      throw new AuthError('No se pudo conectar con el servidor. Verificá que esté disponible.', 'network');
    }
    // No se muestran mensajes arbitrarios del servidor ni cuerpos de error HTML.
    if (!response.ok) throw new AuthError(httpMessage(response.status, path === '/api/clientes'), 'http', response.status);
    if (expectedStatus !== undefined && response.status !== expectedStatus) {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
    try {
      return await response.json();
    } catch {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function getCsrfToken(refresh = false): Promise<string> {
    if (csrfToken && !refresh) return csrfToken;
    csrfToken = null;
    const result = await request('/api/auth/csrf');
    csrfToken = tokenFrom(isRecord(result) ? result.csrfToken : undefined);
    return csrfToken;
  }

  async function login(credentials: LoginCredentials): Promise<AuthIdentity> {
    try {
      // Cada escritura obtiene un token vigente; no se reintenta ningún POST automáticamente.
      const token = await getCsrfToken(true);
      const result = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({
          mail: credentials.mail.trim().toLowerCase(),
          password: credentials.password,
          tipo: credentials.tipo,
        }),
      });
      const identity = identityFrom(isRecord(result) ? result.data : undefined);
      // regenerate() invalidó el token anónimo: reemplazarlo por el entregado por login.
      csrfToken = tokenFrom(isRecord(result) ? result.csrfToken : undefined);
      return identity;
    } catch (error) {
      csrfToken = null;
      throw error;
    }
  }

  async function registerCliente(input: RegisterClientData): Promise<void> {
    try {
      const token = await getCsrfToken(true);
      const result = await request('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        // Seleccionar los campos evita enviar confirmaciones, roles u otros datos del formulario.
        body: JSON.stringify({
          nombre: input.nombre.trim(),
          apellido: input.apellido.trim(),
          dni: input.dni,
          direccion: input.direccion.trim(),
          telefono: input.telefono.trim(),
          mail: input.mail.trim().toLowerCase(),
          password: input.password,
        }),
      }, 201);
      if (!isRecord(result) || typeof result.message !== 'string' || !isRecord(result.data)
        || typeof result.data.id !== 'number' || !Number.isSafeInteger(result.data.id) || result.data.id <= 0) {
        throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
      }
      // Crear una cuenta no inicia sesión: no se guarda identidad ni se consulta /me.
    } catch (error) {
      csrfToken = null;
      throw error;
    }
  }

  async function me(): Promise<AuthIdentity | null> {
    try {
      const result = await request('/api/auth/me');
      return identityFrom(isRecord(result) ? result.data : undefined);
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        csrfToken = null;
        return null;
      }
      throw error;
    }
  }

  async function logout(): Promise<void> {
    try {
      // También funciona después de recargar, cuando solo el navegador conserva la cookie.
      const token = await getCsrfToken(true);
      const result = await request('/api/auth/logout', {
        method: 'POST', headers: { 'X-CSRF-Token': token },
      });
      if (!isRecord(result) || typeof result.message !== 'string') {
        throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
      }
    } finally {
      csrfToken = null;
    }
  }

  return { getCsrfToken, login, registerCliente, me, logout };
}

export const authService = createAuthService();
