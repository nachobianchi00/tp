import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './authContext';
import { AuthError, authService } from '../../service/auth.service';
import type { AuthIdentity, LoginCredentials } from '../../type/authType';

function mensajeDeError(error: unknown): string {
  return error instanceof AuthError ? error.message : 'No se pudo completar la operación.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identidad, establecerIdentidad] = useState<AuthIdentity | null>(null);
  const [comprobandoSesion, establecerComprobandoSesion] = useState(true);
  const [enviando, establecerEnviando] = useState(false);
  const [error, establecerError] = useState<string | null>(null);
  const operacionEnCurso = useRef(false);
  const consultaInicial = useRef<Promise<AuthIdentity | null> | null>(null);

  useEffect(() => {
    let activo = true;
    // StrictMode repite los efectos en desarrollo; comparte esta consulta inicial.
    consultaInicial.current ??= authService.me();
    consultaInicial.current.then(identidadActual => {
      if (activo) establecerIdentidad(identidadActual);
    }).catch(causa => {
      if (activo) establecerError(mensajeDeError(causa));
    }).finally(() => {
      if (activo) establecerComprobandoSesion(false);
    });
    return () => { activo = false; };
  }, []);

  async function ejecutarOperacion(operacion: () => Promise<AuthIdentity | null>): Promise<boolean> {
    // El ref bloquea también dos eventos antes de que React actualice el botón.
    if (operacionEnCurso.current || comprobandoSesion) return false;
    operacionEnCurso.current = true;
    establecerEnviando(true);
    establecerError(null);
    try {
      establecerIdentidad(await operacion());
      return true;
    } catch (causa) {
      establecerError(mensajeDeError(causa));
      // Solo una lectura: aclara sesiones vencidas o un POST cuya respuesta se perdió.
      // No confundir un fallo de conexión con una confirmación de logout.
      try { establecerIdentidad(await authService.me()); } catch { /* Conserva la identidad y el error. */ }
      return false;
    } finally {
      operacionEnCurso.current = false;
      establecerEnviando(false);
    }
  }

  function login(credenciales: LoginCredentials): Promise<boolean> {
    return ejecutarOperacion(() => authService.login(credenciales));
  }

  function logout(): Promise<boolean> {
    return ejecutarOperacion(async () => {
      await authService.logout();
      return null;
    });
  }

  async function refreshSession(): Promise<void> {
    await ejecutarOperacion(() => authService.me());
  }

  function deleteOwnAccount(): Promise<boolean> {
    if (identidad?.tipo !== 'cliente') return Promise.resolve(false);
    // El ID procede de /me o login; no es un argumento editable del formulario.
    const id = identidad.id;
    return ejecutarOperacion(async () => {
      await authService.deleteCliente(id);
      return null;
    });
  }

  return (
    <AuthContext.Provider value={{
      identity: identidad,
      checking: comprobandoSesion,
      submitting: enviando,
      error,
      login,
      logout,
      refreshSession,
      deleteOwnAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
