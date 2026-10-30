// src/page/categories/categories.tsx
import { Link, useSearchParams } from 'react-router-dom';
import { useCatalog } from '../../context/catalogContext/useCatalog';
import { normalize } from '../../util/normalize';
import CategoryFilter from './component/categoryFilter';
import ProductGrid from './component/productGrid';
import styles from './categories.module.css';

export default function Categories() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories, products, loading } = useCatalog();

  if (loading) return <p>Cargando…</p>;

  const selectedId = Number(searchParams.get('categoria')) || null;
  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;
  const query = searchParams.get('buscar')?.trim() ?? '';
  const parentCategory = categories.find((c) => c.id === selectedCategory?.padreId) ?? null;

  // Una categoría principal también muestra los productos de sus subcategorías
  const selectedIds = selectedCategory
    ? [selectedCategory.id, ...categories.filter((c) => c.padreId === selectedCategory.id).map((c) => c.id)]
    : [];

  // filter ya devuelve un array nuevo, así que sort no modifica la lista del contexto
  const visibleProducts = products
    .filter((p) => !selectedCategory || p.categorias.some((c) => selectedIds.includes(c.id)))
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
        {parentCategory && (
          <>
            {' > '}
            <Link to={`/categorias?categoria=${parentCategory.id}`} className={styles.breadcrumbLink}>
              {parentCategory.nombre}
            </Link>
          </>
        )}
        {' > '}
        {title}
      </p>

      <div className={styles.layout}>
        <CategoryFilter
          categories={categories}
          selectedId={selectedCategory?.id ?? null}
          onSelect={handleSelect}
        />
        <ProductGrid products={visibleProducts} emptyMessage={emptyMessage} />
      </div>
    </div>
  );
}