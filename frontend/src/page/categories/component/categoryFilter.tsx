import { Link } from 'react-router-dom';
import type { CategoryType } from '../../../type/categoryType';
import type { ProductType } from '../../../type/productType';
import styles from './categoryFilter.module.css';

interface CategoryFilterProps {
  categories: CategoryType[];
  products: ProductType[];
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
}

export default function CategoryFilter({
  categories,
  products,
  selectedId,
  onSelect,
}: CategoryFilterProps) {
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

        {categories.map((category) => (
          <li key={category.id}>
            <button
              onClick={() => onSelect(category.id)}
              className={
                selectedId === category.id ? `${styles.item} ${styles.itemActivo}` : styles.item
              }
            >
              {category.nombre}
            </button>

            {selectedId === category.id && (
              <ul className={styles.sublista}>
                {products
                  .filter((p) => p.categorias.some((c) => c.id === category.id))
                  .map((p) => (
                    <li key={p.id}>
                      <Link to={`/producto/${p.id}`} className={styles.subLink}>
                        {p.nombre}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}