import { useState } from 'react';
import type { CategoryType } from '../../../type/categoryType';
import styles from './categoryFilter.module.css';

interface CategoryFilterProps {
  categories: CategoryType[];
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
}

export default function CategoryFilter({ categories, selectedId, onSelect }: CategoryFilterProps) {
  // Solo se usa en celular: en pantallas grandes la lista está siempre visible por CSS
  const [open, setOpen] = useState(false);

  const mains = categories.filter((c) => c.padreId === null);
  const selected = categories.find((c) => c.id === selectedId);

  // La categoría "abierta" es la elegida o, si se eligió una subcategoría, su categoría madre
  const openId = selected?.padreId ?? selected?.id ?? null;

  return (
    <aside className={styles.container}>
      {/* Escritorio: título fijo */}
      <h2 className={styles.titulo}>Filtro</h2>

      {/* Celular: botón que abre y cierra la lista */}
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="filtro-categorias"
      >
        <span>
          Filtro
          {selected && <span className={styles.seleccion}> · {selected.nombre}</span>}
        </span>
        <svg
          className={open ? `${styles.flecha} ${styles.flechaAbierta}` : styles.flecha}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ul
        id="filtro-categorias"
        className={open ? `${styles.lista} ${styles.listaAbierta}` : styles.lista}
      >
        <li>
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            className={selectedId === null ? `${styles.item} ${styles.itemActivo}` : styles.item}
          >
            Todos los productos
          </button>
        </li>

        {mains.map((category) => {
          const subs = categories.filter((c) => c.padreId === category.id);
          return (
            <li key={category.id}>
              <button
                onClick={() => {
                  onSelect(category.id);
                  // Si tiene subcategorías, queda abierto para poder elegir una
                  if (subs.length === 0) setOpen(false);
                }}
                className={openId === category.id ? `${styles.item} ${styles.itemActivo}` : styles.item}
              >
                {category.nombre}
              </button>

              {openId === category.id && subs.length > 0 && (
                <ul className={styles.sublista}>
                  {subs.map((sub) => (
                    <li key={sub.id}>
                      <button
                        onClick={() => { onSelect(sub.id); setOpen(false); }}
                        className={selectedId === sub.id ? `${styles.subItem} ${styles.subItemActivo}` : styles.subItem}
                      >
                        {sub.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}