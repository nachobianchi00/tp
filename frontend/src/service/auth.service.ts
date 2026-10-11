import type { AuthIdentity, LoginCredentials } from '../type/authType';

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

function httpMessage(status: number): string {
  if (status === 400) return 'Revisá el correo, la contraseña y el tipo de cuenta.';
  if (status === 401) return 'Correo, contraseña o tipo de cuenta incorrectos.';
  if (status === 403) return 'No se pudo validar la solicitud. Volvé a intentarlo.';
  return 'No se pudo completar la operación. Intentá nuevamente más tarde.';
}

/** Permite probar con fetch simulado; el token vive únicamente en esta instancia, en memoria. */
export function createAuthService(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let csrfToken: string | null = null;

  async function request(path: string, options: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`/api/auth/${path}`, {
        ...options, credentials: 'include', cache: 'no-store',
      });
    } catch {
      throw new AuthError('No se pudo conectar con el servidor. Verificá que esté disponible.', 'network');
    }
    // No se muestran mensajes arbitrarios del servidor ni cuerpos de error HTML.
    if (!response.ok) throw new AuthError(httpMessage(response.status), 'http', response.status);
    try {
      return await response.json();
    } catch {
      throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function getCsrfToken(refresh = false): Promise<string> {
    if (csrfToken && !refresh) return csrfToken;
    csrfToken = null;
    const result = await request('csrf');
    csrfToken = tokenFrom(isRecord(result) ? result.csrfToken : undefined);
    return csrfToken;
  }

  async function login(credentials: LoginCredentials): Promise<AuthIdentity> {
    try {
      // Cada escritura obtiene un token vigente; no se reintenta ningún POST automáticamente.
      const token = await getCsrfToken(true);
      const result = await request('login', {
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

  async function me(): Promise<AuthIdentity | null> {
    try {
      const result = await request('me');
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
      const result = await request('logout', {
        method: 'POST', headers: { 'X-CSRF-Token': token },
      });
      if (!isRecord(result) || typeof result.message !== 'string') {
        throw new AuthError('El servidor devolvió una respuesta inválida.', 'response');
      }
    } finally {
      csrfToken = null;
    }
  }

  return { getCsrfToken, login, me, logout };
}

export const authService = createAuthService();
