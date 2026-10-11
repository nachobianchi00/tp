import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../context/authContext/useAuth';
import type { AccountType } from '../../type/authType';
import styles from './login.module.css';

export default function Login() {
  const { identity, checking, submitting, error, login, logout, refreshSession } = useAuth();
  const [mail, setMail] = useState('');
  const [password, setPassword] = useState('');
  const [tipo, setTipo] = useState<AccountType>('cliente');
  const [validationError, setValidationError] = useState<string | null>(null);
  const disabled = checking || submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (!mail.trim() || !password.trim()) {
      setValidationError('Completá el correo y la contraseña.');
      return;
    }
    setValidationError(null);
    try {
      // Se envía la contraseña original, incluidos sus espacios.
      await login({ mail, password, tipo });
    } finally {
      setPassword('');
    }
  }

  return (
    <section className={styles.container} aria-labelledby="login-title" aria-busy={disabled}>
      <h1 id="login-title">{identity ? 'Sesión iniciada' : 'Iniciar sesión'}</h1>
      {checking && <p role="status">Comprobando sesión…</p>}
      {(validationError || error) && <p className={styles.error} role="alert">{validationError || error}</p>}

      {identity ? (
        <div className={styles.session}>
          <p>Cuenta: <strong>{identity.tipo === 'admin' ? 'Administrador' : 'Cliente'}</strong></p>
          <p>ID: {identity.id}</p>
          <button className={styles.button} type="button" disabled={disabled} onClick={() => void logout()}>
            {submitting ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <fieldset className={styles.fields} disabled={disabled}>
            <label htmlFor="login-mail">Correo electrónico</label>
            <input id="login-mail" name="mail" type="email" autoComplete="username" required
              value={mail} onChange={event => setMail(event.target.value)} />

            <label htmlFor="login-password">Contraseña</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required
              value={password} onChange={event => setPassword(event.target.value)} />

            <label htmlFor="login-tipo">Tipo de cuenta</label>
            <select id="login-tipo" name="tipo" value={tipo}
              onChange={event => setTipo(event.target.value === 'admin' ? 'admin' : 'cliente')}>
              <option value="cliente">Cliente</option>
              <option value="admin">Administrador</option>
            </select>

            <button className={styles.button} type="submit">
              {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <button className={styles.retry} type="button" disabled={disabled} onClick={() => void refreshSession()}>
          Volver a comprobar sesión
        </button>
      )}
    </section>
  );
}
