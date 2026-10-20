import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { productoService, ProductoError } from '../../service/producto.service';
import { categoriaService, CategoriaError } from '../../service/categoria.service';
import type { ProductType } from '../../type/productType';
import type { CategoryType } from '../../type/categoryType';
import styles from './categories.module.css';

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; products: ProductType[]; categories: CategoryType[] };

export default function Categories() {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    Promise.all([productoService.getAll(), categoriaService.getAll()])
      .then(([products, categories]) => {
        if (!cancelled) setState({ status: 'ok', products, categories });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof ProductoError || e instanceof CategoriaError
          ? e.message
          : 'Ocurrió un error inesperado.';
        setState({ status: 'error', message });
      });
    return () => { cancelled = true; };
  }, []);

  // El filtro vive en la URL; un valor inválido se trata como "todas".
  const rawCategory = searchParams.get('categoria');
  const parsed = rawCategory === null ? NaN : Number(rawCategory);
  const selectedId = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;

  function selectCategory(id: number | null) {
    setSearchParams(id === null ? {} : { categoria: String(id) });
  }

  if (state.status === 'loading') return <p className={styles.mensaje}>Cargando...</p>;
  if (state.status === 'error') return <p className={styles.mensaje}>{state.message}</p>;

  const visible = selectedId === null
    ? state.products
    : state.products.filter((p) => p.category.id === selectedId);

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Catálogo</h1>

      <div className={styles.filtros} role="group" aria-label="Filtrar por categoría">
        <button
          type="button"
          className={selectedId === null ? styles.filtroActivo : styles.filtro}
          aria-pressed={selectedId === null}
          onClick={() => selectCategory(null)}
        >
          Todas
        </button>
        {state.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={selectedId === category.id ? styles.filtroActivo : styles.filtro}
            aria-pressed={selectedId === category.id}
            onClick={() => selectCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.mensaje}>No hay productos en esta categoría.</p>
      ) : (
        <div className={styles.grid}>
          {visible.map((p) => (
            <Link key={p.id} to={`/producto/${p.id}`} className={styles.card}>
              <img src={p.image} alt={p.name} className={styles.imagen} />
              <p className={styles.categoria}>{p.category.name}</p>
              <p className={styles.nombre}>{p.name}</p>
              <p className={styles.precio}>${p.price}</p>
              {p.stock === 0 && <p className={styles.sinStock}>Sin stock</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}