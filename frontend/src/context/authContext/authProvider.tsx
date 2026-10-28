import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authContext';
import { HttpError } from '../../service/http';
import { authService } from '../../service/auth.service';
import type { AuthIdentity, LoginCredentials } from '../../type/authType';

class WrongAccountType extends Error {}

function errorMessage(error: unknown): string {
  if (error instanceof WrongAccountType
    || (error instanceof HttpError && (error.status === 400 || error.status === 401))) {
    return 'Correo o contraseña incorrectos.';
  }
  return 'Ocurrió un error. Intentá de nuevo.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const initialCheck = useRef<Promise<AuthIdentity | null> | null>(null);

  useEffect(() => {
    let active = true;
    // StrictMode repite los efectos en desarrollo; comparte esta consulta inicial.
    initialCheck.current ??= authService.me();
    initialCheck.current.then(current => {
      if (active) setIdentity(current);
    }).catch(() => {
      // Sin conexión: se trata como "sin sesión". No se muestra ningún error.
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, []);

  async function runOperation(operation: () => Promise<AuthIdentity | null>): Promise<boolean> {
    // El ref bloquea también dos eventos antes de que React actualice el botón.
    if (busy.current || checking) return false;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      setIdentity(await operation());
      return true;
    } catch (cause) {
      console.error(cause); // el detalle técnico queda en la consola, no en la pantalla
      setError(errorMessage(cause));
      // Solo una lectura: aclara sesiones vencidas o un POST cuya respuesta se perdió.
      // No confundir un fallo de conexión con una confirmación de logout.
      try { setIdentity(await authService.me()); } catch { /* Conserva la identidad y el error. */ }
      return false;
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  function login(credentials: LoginCredentials): Promise<boolean> {
    return runOperation(async () => {
      const identity = await authService.login(credentials);
      // El backend decide el tipo por el mail. Si no coincide con la pantalla usada, se cierra esa sesión.
      if (identity.tipo !== credentials.tipo) {
        await authService.logout().catch(() => {});
        throw new WrongAccountType();
      }
      return identity;
    });
  }

  function logout(): Promise<boolean> {
    return runOperation(async () => {
      await authService.logout();
      return null;
    });
  }

  async function refreshSession(): Promise<void> {
    await runOperation(() => authService.me());
  }

  return (
    <AuthContext.Provider value={{ identity, checking, submitting, error, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}