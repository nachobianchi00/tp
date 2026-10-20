import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authContext';
import { AuthError, authService } from '../../service/auth.service';
import type { AuthIdentity, LoginCredentials } from '../../type/authType';

function errorMessage(error: unknown): string {
  return error instanceof AuthError ? error.message : 'No se pudo completar la operación.';
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
    // Limita la espera inicial e ignora respuestas que lleguen después.
    const temporizador = setTimeout(() => {
      active = false;
      setChecking(false);
    }, 5000);
    // StrictMode repite los efectos en desarrollo; comparte esta consulta inicial.
    initialCheck.current ??= authService.me();
    initialCheck.current.then(current => {
      if (active) setIdentity(current);
    }).catch(() => {
      // La consulta inicial es silenciosa; runOperation conserva los errores manuales.
    }).finally(() => {
      clearTimeout(temporizador);
      if (active) setChecking(false);
    });
    return () => { active = false; clearTimeout(temporizador); };
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
    return runOperation(() => authService.login(credentials));
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
