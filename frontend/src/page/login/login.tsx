import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/authContext/useAuth';
import type { AccountType } from '../../type/authType';
import styles from './login.module.css';

export default function Login({ tipo }: { tipo: AccountType }) {
  const {
    identity: identidad,
    checking: comprobandoSesion,
    submitting: enviando,
    error,
    login: iniciarSesion,
    logout: cerrarSesion,
    refreshSession: actualizarSesion,
  } = useAuth();
  const [correo, establecerCorreo] = useState('');
  const [contrasena, establecerContrasena] = useState('');
  const [errorDeValidacion, establecerErrorDeValidacion] = useState<string | null>(null);
  const deshabilitado = comprobandoSesion || enviando;

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (deshabilitado) return;
    if (!correo.trim() || !contrasena.trim()) {
      establecerErrorDeValidacion('Completá el correo y la contraseña.');
      return;
    }
    establecerErrorDeValidacion(null);
    try {
      // Se envía la contraseña original, incluidos sus espacios.
      await iniciarSesion({ mail: correo, password: contrasena, tipo });
    } finally {
      establecerContrasena('');
    }
  }

  return (
    <section className={styles.container} aria-labelledby="login-title" aria-busy={deshabilitado}>
      <h1 id="login-title">Iniciar sesión</h1>
      {comprobandoSesion && <p role="status">Comprobando sesión…</p>}
      {(errorDeValidacion || error) && <p className={styles.error} role="alert">{errorDeValidacion || error}</p>}

      {identidad ? (
        <div className={styles.session}>
          <p>Cuenta: <strong>{identidad.tipo === 'admin' ? 'Administrador' : 'Cliente'}</strong></p>
          <p>ID: {identidad.id}</p>
          <button className={styles.button} type="button" disabled={deshabilitado} onClick={() => void cerrarSesion()}>
            {enviando ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={enviarFormulario}>
          <fieldset className={styles.fields} disabled={deshabilitado}>
            <label htmlFor="login-mail">Correo electrónico</label>
            <input id="login-mail" name="mail" type="email" autoComplete="username" required
              value={correo} onChange={evento => establecerCorreo(evento.target.value)} />

            <label htmlFor="login-password">Contraseña</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required
              value={contrasena} onChange={evento => establecerContrasena(evento.target.value)} />

            <button className={styles.button} type="submit">
              {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <button className={styles.retry} type="button" disabled={deshabilitado} onClick={() => void actualizarSesion()}>
          Volver a comprobar sesión
        </button>
      )}
    </section>
  );
}
