import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { HttpError } from '../../../../service/http';
import { confirmPassword, updateClient } from '../../../../service/client.service';
import type { AccountOutletContext } from '../../../../type/clientType';
import styles from '../../accountPanel.module.css';

export default function EditData() {
  const { client, reload } = useOutletContext<AccountOutletContext>();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: client.nombre,
    apellido: client.apellido,
    dni: String(client.dni),
    direccion: client.direccion,
    telefono: client.telefono,
    mail: client.mail,
    password: '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function setField(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const dni = Number(form.dni.trim());
    if (!Number.isInteger(dni) || dni <= 0) {
      setError('El DNI debe ser un número.');
      return;
    }

    setSending(true);
    try {
      await confirmPassword(client.mail, form.password); // con el mail actual, antes de cambiarlo
      await updateClient(client.id, {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni,
        direccion: form.direccion.trim(),
        telefono: form.telefono.trim(),
        mail: form.mail.trim().toLowerCase(),
      });
      await reload();
      navigate('/mi-cuenta/datos', { state: { notice: 'Tus datos se actualizaron correctamente.' } });
    } catch (cause) {
      console.error(cause);
      if (cause instanceof HttpError && cause.status === 401) setError('La contraseña es incorrecta.');
      else if (cause instanceof HttpError && cause.status === 409) setError('Ya existe una cuenta con ese correo o DNI.');
      else setError('No se pudieron guardar los cambios. Intentá de nuevo.');
      setForm((previous) => ({ ...previous, password: '' }));
      setSending(false);
    }
  }

  return (
    <>
      <h1 className={styles.titulo}>Modificar datos</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="edit-nombre">Nombre</label>
        <input id="edit-nombre" type="text" required value={form.nombre}
          onChange={(e) => setField('nombre', e.target.value)} />

        <label htmlFor="edit-apellido">Apellido</label>
        <input id="edit-apellido" type="text" required value={form.apellido}
          onChange={(e) => setField('apellido', e.target.value)} />

        <label htmlFor="edit-dni">DNI</label>
        <input id="edit-dni" type="text" inputMode="numeric" required value={form.dni}
          onChange={(e) => setField('dni', e.target.value)} />

        <label htmlFor="edit-direccion">Dirección</label>
        <input id="edit-direccion" type="text" required value={form.direccion}
          onChange={(e) => setField('direccion', e.target.value)} />

        <label htmlFor="edit-telefono">Teléfono</label>
        <input id="edit-telefono" type="tel" required value={form.telefono}
          onChange={(e) => setField('telefono', e.target.value)} />

        <label htmlFor="edit-mail">Correo electrónico</label>
        <input id="edit-mail" type="email" required value={form.mail}
          onChange={(e) => setField('mail', e.target.value)} />

        <label className={styles.separador} htmlFor="edit-password">Para confirmar, ingresá tu contraseña</label>
        <input id="edit-password" type="password" autoComplete="current-password" required value={form.password}
          onChange={(e) => setField('password', e.target.value)} />

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