import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContext/useAuth';
import type { AccountType } from '../../type/authType';
import styles from './login.module.css';

export default function Login({ tipo }: { tipo: AccountType }) {
  const { identity, checking, submitting, error, login } = useAuth();
  const location = useLocation();
  const [mail, setMail] = useState('');
  const [password, setPassword] = useState('');
  const disabled = checking || submitting;

  // Si venía redirigido (por ejemplo desde /checkout), vuelve ahí; si no, al inicio.
  const from = location.state?.from?.pathname ?? (tipo === 'admin' ? '/admin' : '/');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login({ mail: mail.trim().toLowerCase(), password, tipo });
    setPassword('');
  }

  // Con sesión iniciada no tiene sentido ver el login (también corre justo después de loguearse).
  if (identity?.tipo === tipo) return <Navigate to={from} replace />;

  return (
    <section className={styles.container}>
      <h1>{tipo === 'admin' ? 'Acceso administradores' : 'Iniciar sesión'}</h1>
      {location.state?.from && <p>Iniciá sesión para continuar.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.fields} disabled={disabled}>
          <label htmlFor="login-mail">Correo electrónico</label>
          <input id="login-mail" type="email" autoComplete="username" required
            value={mail} onChange={event => setMail(event.target.value)} />

          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" type="password" autoComplete="current-password" required
            value={password} onChange={event => setPassword(event.target.value)} />

          <button className={styles.button} type="submit">
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </fieldset>
      </form>

      {tipo === 'cliente' && (
        <Link className={styles.link} to="/registro" state={location.state}>
          ¿No tenés cuenta? Registrate
        </Link>
      )}
    </section>
  );
}