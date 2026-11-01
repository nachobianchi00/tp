import { useEffect, useState } from 'react';
import type { SubmitEvent } from 'react';
import { http, HttpError } from '../../../../service/http';
import { useAuth } from '../../../../context/authContext/useAuth';
import panel from '../../../myAccount/accountPanel.module.css';
import styles from './admins.module.css';

interface AdminUser {
  id: number;
  nombre: string;
  apellido: string;
  dni: number;
  mail: string;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return 'Ya existe una cuenta con ese correo o un administrador con ese DNI.';
    }
    if (error.status === 401 || error.status === 403) {
      return 'Volvé a ingresar con una cuenta de administrador.';
    }
    if (error.status === 404) {
      return 'Ese administrador ya no existe. Recargá la página.';
    }
  }
  return fallback;
}

export default function Admins() {
  const { identity } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    http<{ data: AdminUser[] }>('/admins')
      .then((response) => setAdmins(response.data))
      .catch((cause) => setError(errorMessage(cause, 'No se pudieron cargar los administradores.')))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setEditingId(null);
    setName('');
    setLastName('');
    setDni('');
    setEmail('');
    setPassword('');
    setError('');
    setNotice('');
  }

  function handleEdit(admin: AdminUser) {
    setEditingId(admin.id);
    setName(admin.nombre);
    setLastName(admin.apellido);
    setDni(String(admin.dni));
    setEmail(admin.mail);
    setPassword('');
    setError('');
    setNotice('');
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving) return;

    setError('');
    setNotice('');

    if (name.trim() === '' || lastName.trim() === '' || email.trim() === '') {
      setError('Completá nombre, apellido y correo.');
      return;
    }

    const dniNumber = Number(dni);
    if (!Number.isSafeInteger(dniNumber) || dniNumber <= 0) {
      setError('El DNI debe ser un número entero positivo.');
      return;
    }

    if (editingId === null && password.trim() === '') {
      setError('Ingresá una contraseña para el nuevo administrador.');
      return;
    }

    const body: {
      nombre: string;
      apellido: string;
      dni: number;
      mail: string;
      password?: string;
    } = {
      nombre: name.trim(),
      apellido: lastName.trim(),
      dni: dniNumber,
      mail: email.trim().toLowerCase(),
    };

    if (password.trim() !== '') body.password = password.trim();

    setSaving(true);

    try {
      const path = editingId === null ? '/admins' : `/admins/${editingId}`;

      const response = await http<{ data: AdminUser }>(path, {
        method: editingId === null ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });

      if (editingId === null) {
        setAdmins((previous) => [...previous, response.data]);
      } else {
        setAdmins((previous) =>
          previous.map((admin) => admin.id === editingId ? response.data : admin)
        );
      }

      resetForm();
      setNotice('Administrador guardado correctamente.');
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo guardar el administrador. Revisá los datos.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(admin: AdminUser) {
    if (saving || admin.id === identity?.id) return;
    if (!window.confirm(`¿Eliminar al administrador "${admin.nombre} ${admin.apellido}"?`)) return;

    setSaving(true);
    setError('');
    setNotice('');

    try {
      await http(`/admins/${admin.id}`, { method: 'DELETE' });

      setAdmins((previous) => previous.filter((item) => item.id !== admin.id));

      if (editingId === admin.id) resetForm();

      setNotice('Administrador eliminado correctamente.');
    } catch (cause) {
      setError(errorMessage(cause, 'No se pudo eliminar el administrador.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className={styles.title}>Administradores</h1>
      <p className={panel.texto}>Administrá las cuentas de acceso al panel.</p>

      {loading && <p className={panel.texto}>Cargando administradores…</p>}
      {error && <p className={panel.error} role="alert">{error}</p>}
      {notice && <p className={panel.aviso} role="status">{notice}</p>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <h2>{editingId === null ? 'Nuevo administrador' : 'Editar administrador'}</h2>

        <div className={styles.field}>
          <label htmlFor="admin-name">Nombre</label>
          <input
            id="admin-name" type="text" required maxLength={255}
            disabled={loading || saving} value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="admin-last-name">Apellido</label>
          <input
            id="admin-last-name" type="text" required maxLength={255}
            disabled={loading || saving} value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="admin-dni">DNI</label>
          <input
            id="admin-dni" type="number" required min="1" step="1"
            disabled={loading || saving} value={dni}
            onChange={(event) => setDni(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="admin-email">Correo electrónico</label>
          <input
            id="admin-email" type="email" required maxLength={255}
            disabled={loading || saving} value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="admin-password">
            {editingId === null ? 'Contraseña' : 'Nueva contraseña (opcional)'}
          </label>
          <input
            id="admin-password" type="password" autoComplete="new-password"
            required={editingId === null} disabled={loading || saving}
            value={password}
            placeholder={editingId === null ? '' : 'Dejá vacío para conservar la actual'}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className={styles.formActions}>
          <button type="submit" className={panel.boton} disabled={loading || saving}>
            {saving ? 'Procesando…' : 'Guardar administrador'}
          </button>

          {editingId !== null && (
            <button
              type="button" className={`${panel.boton} ${panel.secundario}`}
              disabled={saving} onClick={resetForm}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      {!loading && !error && admins.length === 0 && (
        <p className={panel.texto}>Todavía no hay administradores.</p>
      )}

      {admins.length > 0 && (
        <ul className={styles.list}>
          {admins.map((admin) => (
            <li key={admin.id} className={styles.row}>
              <div className={styles.adminInfo}>
                <strong>
                  {admin.nombre} {admin.apellido}
                  {admin.id === identity?.id && ' (Tu cuenta)'}
                </strong>
                <span>{admin.mail}</span>
                <span>DNI: {admin.dni}</span>
              </div>

              <div className={styles.actions}>
                <button
                  type="button" className={styles.iconButton}
                  disabled={saving} onClick={() => handleEdit(admin)}
                  aria-label={`Editar a ${admin.nombre} ${admin.apellido}`}
                  title="Editar administrador"
                >
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m16 3 5 5-12 12H4v-5L16 3Z" />
                    <path d="m14 5 5 5" />
                  </svg>
                </button>

                <button
                  type="button" className={`${styles.iconButton} ${styles.deleteButton}`}
                  disabled={saving || admin.id === identity?.id}
                  onClick={() => handleDelete(admin)}
                  aria-label={`Eliminar a ${admin.nombre} ${admin.apellido}`}
                  title={admin.id === identity?.id
                    ? 'Tu cuenta actual no se elimina desde esta pantalla'
                    : 'Eliminar administrador'}
                >
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M9 6V4h6v2" />
                    <path d="M5 6l1 14h12l1-14" />
                    <path d="M10 10v6M14 10v6" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}