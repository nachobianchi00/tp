import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { HttpError } from '../../../../service/http';
import { confirmPassword, updateClient } from '../../../../service/client.service';
import type { AccountOutletContext } from '../../../../type/clientType';
import styles from '../../accountPanel.module.css';

const emptyForm = { current: '', next: '', confirm: '' };

export default function ChangePassword() {
  const { client } = useOutletContext<AccountOutletContext>();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function setField(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (form.next !== form.confirm) {
      setError('La contraseña nueva y su confirmación no coinciden.');
      return;
    }

    setSending(true);
    try {
      await confirmPassword(client.mail, form.current);
      await updateClient(client.id, { password: form.next });
      navigate('/mi-cuenta/datos', { state: { notice: 'Tu contraseña se cambió correctamente.' } });
    } catch (cause) {
      console.error(cause);
      if (cause instanceof HttpError && cause.status === 401) setError('La contraseña actual es incorrecta.');
      else setError('No se pudo cambiar la contraseña. Intentá de nuevo.');
      setForm(emptyForm);
      setSending(false);
    }
  }

  return (
    <>
      <h1 className={styles.titulo}>Cambiar contraseña</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="pw-current">Contraseña actual</label>
        <input id="pw-current" type="password" autoComplete="current-password" required value={form.current}
          onChange={(e) => setField('current', e.target.value)} />

        <label htmlFor="pw-next">Contraseña nueva</label>
        <input id="pw-next" type="password" autoComplete="new-password" required value={form.next}
          onChange={(e) => setField('next', e.target.value)} />

        <label htmlFor="pw-confirm">Confirmación de la contraseña nueva</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" required value={form.confirm}
          onChange={(e) => setField('confirm', e.target.value)} />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <div className={styles.botones}>
          <Link to="/mi-cuenta/datos" className={`${styles.boton} ${styles.secundario}`}>Cancelar</Link>
          <button type="submit" className={styles.boton} disabled={sending}>
            {sending ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </>
  );
}