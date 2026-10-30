import panel from '../../../myAccount/accountPanel.module.css';
import { useEffect, useState } from 'react';
import { getCategories, createCategory, updateCategory, deleteCategory, } from '../../../../service/category.service';import type { CategoryType } from '../../../../type/categoryType';
import type { SubmitEvent } from 'react';
import styles from './categories.module.css';

export default function AdminCategories() {
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setError('No se pudieron cargar las categorías.'))
      .finally(() => setLoading(false));
  }, []);

  function handleEdit(category: CategoryType) {     // Carga la categoría en el formulario para editarla
    setEditingId(category.id);
    setName(category.nombre);
    setParentId(category.categoriaPadre ?? null);
    setError('');
  }

  function resetForm() {    // Limpia el campo y vuelve al modo de creación
    setEditingId(null);
    setName('');
    setParentId(null);
    setError('');
  }
  
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving || name.trim() === '') return;

    setSaving(true);
    setError('');

    try {
      if (editingId === null) {
        const newCategory = await createCategory(name.trim(), parentId);
        setCategories((previous) => [...previous, newCategory]);
      } else {
        const updatedCategory = await updateCategory(editingId, name.trim(), parentId);
        setCategories((previous) =>
          previous.map((category) =>
            category.id === editingId ? updatedCategory : category
          )
        );
      }

      resetForm();
    } catch {
      setError('No se pudo guardar la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: CategoryType) {
    if (saving) return;
    if (!window.confirm(`¿Eliminar la categoría "${category.nombre}"?`)) return;

    setSaving(true);
    setError('');

    try {
      await deleteCategory(category.id);
      setCategories((previous) =>
        previous.filter((item) => item.id !== category.id)
      );

      if (editingId === category.id) resetForm();
    } catch {
      setError('No se pudo eliminar la categoría.');
    } finally {
      setSaving(false);
    }
  }

  function getCategoryDescription(category: CategoryType) {
    const parent = categories.find((item) => item.id === category.categoriaPadre);

    if (parent) {
      return `Subcategoría de ${parent.nombre}`;
    }

    return 'Categoría principal';
  }

  return (
    <>
      <h1 className={styles.title}>Categorías</h1>
      <p className={panel.texto}>
        Administrá las categorías del supermercado.
      </p>

      <form className={`${panel.form} ${styles.compactForm}`} onSubmit={handleSubmit}>
        <h2>{editingId === null ? 'Nueva categoría' : 'Editar categoría'}</h2>

        <div className={styles.field}>
          <label htmlFor="category-name">Nombre</label>
          <input
            id="category-name"
            type="text"
            required
            maxLength={255}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="category-parent">Categoría padre</label>
          <select
            id="category-parent"
            value={parentId ?? ''}
            disabled={loading || saving}
            onChange={(event) =>
              setParentId(event.target.value === '' ? null : Number(event.target.value))
            }
          >
            <option value="">Ninguna (categoría principal)</option>

            {categories
              .filter((category) => !category.categoriaPadre && category.id !== editingId)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
          </select>
        </div>

        <button
          type="submit"
          className={panel.boton}
          disabled={loading || saving || name.trim() === ''}
        >
          {saving ? 'Procesando…' : 'Guardar categoría'}
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

      {loading && <p className={panel.texto}>Cargando categorías…</p>}

      {error && <p className={panel.error} role="alert">{error}</p>}

      {!loading && !error && categories.length === 0 && (
        <p className={panel.texto}>Todavía no hay categorías.</p>
      )}

      <ul className={styles.list}>
        {categories.map((category) => (
          <li key={category.id} className={styles.row}>
            <div className={styles.categoryInfo}>
              <strong>{category.nombre}</strong>
              <span className={styles.categoryDescription}>
                {getCategoryDescription(category)}
              </span>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.iconButton}
                disabled={saving}
                onClick={() => handleEdit(category)}
                aria-label={`Editar ${category.nombre}`}
                title="Editar categoría"
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
                onClick={() => handleDelete(category)}
                aria-label={`Eliminar ${category.nombre}`}
                title="Eliminar categoría"
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