// src/page/categories/categories.tsx
import { Link, useSearchParams } from 'react-router-dom';
import { categories } from '../../mock/categories';
import { products } from '../../mock/products';
import { normalize } from '../../util/normalize';
import CategoryFilter from './component/categoryFilter';
import ProductGrid from './component/productGrid';
import styles from './categories.module.css';

export default function Categories() {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = Number(searchParams.get('categoria')) || null;
  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;
  const query = searchParams.get('buscar')?.trim() ?? '';

  // filter ya devuelve un array nuevo, así que sort no modifica el mock
  const visibleProducts = products
    .filter((p) => !selectedCategory || p.categorias.some((c) => c.id === selectedCategory.id))
    .filter((p) => query === '' || normalize(p.nombre).includes(normalize(query)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Cambia solo la categoría y conserva la búsqueda que haya en la URL
  function handleSelect(categoryId: number | null) {
    const params = new URLSearchParams(searchParams);
    if (categoryId === null) params.delete('categoria');
    else params.set('categoria', String(categoryId));
    setSearchParams(params);
  }

  const inCategory = selectedCategory ? ` en ${selectedCategory.nombre}` : '';

  let title = selectedCategory?.nombre ?? 'Todos los productos';
  if (query !== '') title = `Resultados para "${query}"${inCategory}`;

  const emptyMessage =
    query !== ''
      ? `No encontramos productos para "${query}"${inCategory}.`
      : 'No hay productos en esta categoría.';

  return (
    <div className={styles.container}>
      <p className={styles.breadcrumb}>
        <Link to="/categorias" className={styles.breadcrumbLink}>Categorías</Link>
        {' > '}
        {title}
      </p>

      <div className={styles.layout}>
        <CategoryFilter
          categories={categories}
          products={products}
          selectedId={selectedCategory?.id ?? null}
          onSelect={handleSelect}
        />
        <ProductGrid products={visibleProducts} emptyMessage={emptyMessage} />
      </div>
    </div>
  );
}