import panel from '../../../myAccount/accountPanel.module.css';
import { useEffect, useState } from 'react';
import { http } from '../../../../service/http';
import type { PayMethod } from '../../../../type/payMethod';
import type { SubmitEvent } from 'react';
import styles from './payMethods.module.css';

export default function AdminPayMethods() {
  const [payMethods, setPayMethods] = useState<PayMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);


  useEffect(() => {
    http<{ data: PayMethod[] }>('/metodos-pago')
      .then((response) => setPayMethods(response.data))
      .catch(() => setError('No se pudieron cargar los métodos de pago.'))
      .finally(() => setLoading(false));
  }, []);

  function handleEdit(method: PayMethod) {
    setEditingId(method.id);
    setDescription(method.descripcion);
    setActive(method.estado);
    setError('');
  }

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setActive(true);
    setError('');
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving || description.trim() === '') return;

    setSaving(true);
    setError('');

    try {
      const path = editingId === null
        ? '/metodos-pago'
        : `/metodos-pago/${editingId}`;

      const response = await http<{ data: PayMethod }>(path, {
        method: editingId === null ? 'POST' : 'PUT',
        body: JSON.stringify({
          descripcion: description.trim(),
          estado: active,
        }),
      });

      if (editingId === null) {
        setPayMethods((previous) => [...previous, response.data]);
      } else {
        setPayMethods((previous) =>
          previous.map((method) =>
            method.id === editingId ? response.data : method
          )
        );
      }

      resetForm();
    } catch {
      setError('No se pudo guardar el método de pago.');
    } finally {
      setSaving(false);
    }
  }  

  async function handleDelete(method: PayMethod) {
    if (saving) return;
    if (!window.confirm(`¿Eliminar el método de pago "${method.descripcion}"?`)) return;

    setSaving(true);
    setError('');

    try {
      await http(`/metodos-pago/${method.id}`, { method: 'DELETE' });

      setPayMethods((previous) =>
        previous.filter((item) => item.id !== method.id)
      );

      if (editingId === method.id) resetForm();
    } catch {
      setError('No se pudo eliminar el método de pago.');
    } finally {
      setSaving(false);
    }
  }
  
  return (
    <>
      <h1 className={styles.title}>Métodos de pago</h1>
      <p className={panel.texto}>
        Administrá los métodos de pago disponibles.
      </p>

      <form className={`${panel.form} ${styles.compactForm}`} onSubmit={handleSubmit}>
        <h2>{editingId === null ? 'Nuevo método de pago' : 'Editar método de pago'}</h2>

        <div className={styles.field}>
          <label htmlFor="pay-description">Nombre</label>
          <input
            id="pay-description"
            type="text"
            required
            maxLength={255}
            value={description}
            disabled={saving}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="pay-state">Estado</label>
          <select
            id="pay-state"
            disabled={saving}
            value={active ? 'active' : 'inactive'}
            onChange={(event) => setActive(event.target.value === 'active')}
          >
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>

        <button
          type="submit"
          className={panel.boton}
          disabled={loading || saving || description.trim() === ''}
        >
          {saving ? 'Procesando…' : 'Guardar método de pago'}
        </button>

        {editingId !== null && (
          <button
            type="button"
            className={`${panel.boton} ${panel.secundario}`}
            disabled={saving}
            onClick={resetForm}
          >
            Cancelar edición
          </button>
        )}
      </form>

      {loading && <p className={panel.texto}>Cargando métodos de pago…</p>}

      {error && <p className={panel.error} role="alert">{error}</p>}

      {!loading && !error && payMethods.length === 0 && (
        <p className={panel.texto}>Todavía no hay métodos de pago.</p>
      )}

      <ul className={styles.list}>
        {payMethods.map((method) => (
          <li key={method.id} className={styles.row}>
            <div className={styles.methodInfo}>
              <strong>{method.descripcion}</strong>
              <span className={styles.methodDescription}>
                {method.estado ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.iconButton}
                disabled={saving}
                onClick={() => handleEdit(method)}
                aria-label={`Editar ${method.descripcion}`}
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
                type="button"
                className={`${styles.iconButton} ${styles.deleteButton}`}
                disabled={saving}
                onClick={() => handleDelete(method)}
                aria-label={`Eliminar ${method.descripcion}`}
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

    </>
  );
}