import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../../../context/authContext/useAuth';
import { HttpError } from '../../../../service/http';
import { confirmPassword, deleteClient } from '../../../../service/client.service';
import type { AccountOutletContext } from '../../../../type/clientType';
import styles from '../../accountPanel.module.css';

export default function DeleteAccount() {
  const { client } = useOutletContext<AccountOutletContext>();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSending(true);
    try {
      await confirmPassword(client.mail, password);
      await deleteClient(client.id);
      await logout(); // cierra la sesión de una cuenta que ya no existe
      navigate('/', { replace: true });
    } catch (cause) {
      console.error(cause);
      if (cause instanceof HttpError && cause.status === 401) setError('La contraseña es incorrecta.');
      else if (cause instanceof HttpError && cause.status === 409) setError('No podés eliminar tu cuenta porque tenés pedidos registrados.');
      else setError('No se pudo eliminar la cuenta. Intentá de nuevo.');
      setPassword('');
      setSending(false);
    }
  }

  return (
    <>
      <h1 className={styles.titulo}>Eliminar cuenta</h1>
      <p className={styles.texto}>
        Vas a eliminar tu cuenta de forma definitiva. Esta acción no se puede deshacer.
        Para confirmar, ingresá tu contraseña.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="delete-password">Contraseña</label>
        <input id="delete-password" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />

        <div className={styles.botones}>
          <Link to="/mi-cuenta/datos" className={`${styles.boton} ${styles.secundario}`}>Cancelar</Link>
          <button type="submit" className={`${styles.boton} ${styles.peligroLleno}`} disabled={sending}>
            {sending ? 'Eliminando…' : 'Eliminar mi cuenta'}
          </button>
        </div>
      </form>
    </>
  );
}