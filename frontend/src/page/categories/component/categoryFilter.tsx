import type { CategoryType } from '../../../type/categoryType';
import styles from './categoryFilter.module.css';

interface CategoryFilterProps {
  categories: CategoryType[];
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
}

export default function CategoryFilter({ categories, selectedId, onSelect }: CategoryFilterProps) {
  const mains = categories.filter((c) => c.padreId === null);
  const selected = categories.find((c) => c.id === selectedId);

  // La categoría "abierta" es la elegida o, si se eligió una subcategoría, su categoría madre
  const openId = selected?.padreId ?? selected?.id ?? null;

  return (
    <aside className={styles.container}>
      <h2 className={styles.titulo}>Filtro</h2>

      <ul className={styles.lista}>
        <li>
          <button
            onClick={() => onSelect(null)}
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
                onClick={() => onSelect(category.id)}
                className={openId === category.id ? `${styles.item} ${styles.itemActivo}` : styles.item}
              >
                {category.nombre}
              </button>

              {openId === category.id && subs.length > 0 && (
                <ul className={styles.sublista}>
                  {subs.map((sub) => (
                    <li key={sub.id}>
                      <button
                        onClick={() => onSelect(sub.id)}
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