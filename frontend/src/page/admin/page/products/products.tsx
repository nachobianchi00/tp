import panel from '../../../myAccount/accountPanel.module.css';
import { useEffect, useState } from 'react';
import { http } from '../../../../service/http';
import type { ProductType } from '../../../../type/productType';
import { getCategories } from '../../../../service/category.service';
import type { CategoryType } from '../../../../type/categoryType';
import type { SubmitEvent } from 'react';
import styles from './products.module.css';


export default function AdminProducts() {
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

 useEffect(() => {
  Promise.all([
    http<{ data: ProductType[] }>('/productos'),
    getCategories(),
  ])
    .then(([productResponse, categoryList]) => {
      setProducts(productResponse.data);
      setCategories(categoryList);
    })
    .catch(() => setError('No se pudieron cargar los productos y las categorías.'))
    .finally(() => setLoading(false));
  }, []);

  function handleCategoryChange(position: number, value: string) {
    if (position === 0) {
      setSelectedCategoryIds(value === '' ? [] : [Number(value)]);
      return;
    }

    setSelectedCategoryIds((previous) => {
      const firstId = previous[0];
      if (firstId === undefined) return [];

      return value === ''
        ? [firstId]
        : [firstId, Number(value)];
    });
  }

      function handleEdit(product: ProductType) {
        setEditingId(product.id);
        setName(product.nombre);
        setDescription(product.descripcion);
        setPrice(String(product.precio));
        setStock(String(product.cantidad));
        setActive(product.estado);
        const categoryIds = product.categorias.map((category) => category.id);

        const parent = categories.find((category) =>
          categoryIds.includes(category.id) && !category.categoriaPadre
        );

        setSelectedCategoryIds(
          parent
            ? [parent.id, ...categoryIds.filter((id) => id !== parent.id)]
            : categoryIds
        );

        setError('');
      }

      function resetForm() {
        setEditingId(null);
        setError('');
        setName('');
        setDescription('');
        setPrice('');
        setStock('');
        setActive(true);
        setSelectedCategoryIds([]);
      }

      async function handleDelete(product: ProductType) {
        if (saving) return;
        if (!window.confirm(`¿Eliminar el producto "${product.nombre}"?`)) return;

        setSaving(true);
        setError('');

        try {
          await http(`/productos/${product.id}`, { method: 'DELETE' });

          setProducts((previous) =>
            previous.filter((item) => item.id !== product.id)
          );

          if (editingId === product.id) resetForm();
        } catch {
          setError('No se pudo eliminar el producto.');
        } finally {
          setSaving(false);
        }
      }

      async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (loading || saving) return;

        setError('');

        if (selectedCategoryIds.length === 0 || selectedCategoryIds.length > 2) {
          setError('Seleccioná una o dos categorías.');
          return;
        }

        const parent = categories.find((category) =>
          category.id === selectedCategoryIds[0] && !category.categoriaPadre
        );

        if (!parent) {
          setError('Seleccioná una categoría principal.');
          return;
        }

        if (selectedCategoryIds.length === 2) {
          const child = categories.find((category) =>
            category.id === selectedCategoryIds[1] &&
            category.categoriaPadre === parent.id
          );

          if (!child) {
            setError('La subcategoría debe pertenecer a la categoría seleccionada.');
            return;
          }
        }

        if (name.trim() === '' || description.trim() === '') {
          setError('Completá el nombre y la descripción.');
          return;
        }

        setSaving(true);

        try {
          const path = editingId === null
            ? '/productos'
            : `/productos/${editingId}`;

          const response = await http<{ data: ProductType }>(path, {
            method: editingId === null ? 'POST' : 'PUT',
            body: JSON.stringify({
              nombre: name.trim(),
              descripcion: description.trim(),
              precio: Number(price),
              cantidad: Number(stock),
              estado: active,
              categorias: selectedCategoryIds,
            }),
          });

          const newProduct = {
            ...response.data,
            categorias: categories.filter((category) =>
              selectedCategoryIds.includes(category.id)
            ),
          };

          if (editingId === null) {
            setProducts((previous) => [...previous, newProduct]);
          } else {
            setProducts((previous) =>
              previous.map((product) =>
                product.id === editingId ? newProduct : product
              )
            );
          }

          resetForm();

        } catch {
          setError('No se pudo guardar el producto.');
        } finally {
          setSaving(false);
        }
      }




  return (
    <>
      <h1 className={styles.title}>Productos</h1>
      <p className={panel.texto}>
        Administrá los productos y sus categorías.
      </p>


      <form className={styles.form} onSubmit={handleSubmit}>
        <h2>{editingId === null ? 'Nuevo producto' : 'Editar producto'}</h2>

        <div>
          <label htmlFor="product-name">Nombre</label>
          <input
            id="product-name"
            type="text"
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="product-state">Estado</label>
          <select
            id="product-state"
            value={active ? 'active' : 'inactive'}
            onChange={(event) => setActive(event.target.value === 'active')}
          >
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </div>

        <div>
          <label htmlFor="product-price">Precio</label>
          <input
            id="product-price"
            type="number"
            required
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="product-stock">Stock</label>
          <input
            id="product-stock"
            type="number"
            required
            min="0"
            step="1"
            value={stock}
            onChange={(event) => setStock(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="product-category">Categoría</label>
          <select
            id="product-category"
            required
            disabled={saving}
            value={selectedCategoryIds[0] ?? ''}
            onChange={(event) => handleCategoryChange(0, event.target.value)}
          >
            <option value="">Seleccioná una categoría</option>

            {categories.filter((category) => !category.categoriaPadre).map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product-second-category">Subcategoría</label>
          <select
            id="product-second-category"
            disabled={saving || selectedCategoryIds.length === 0}
            value={selectedCategoryIds[1] ?? ''}
            onChange={(event) => handleCategoryChange(1, event.target.value)}
          >
            <option value="">Sin subcategoría</option>

            {categories
              .filter((category) =>
                selectedCategoryIds.length > 0 &&
                category.categoriaPadre === selectedCategoryIds[0]
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
          </select>
        </div>
        
         <div>
          <label htmlFor="product-description">Descripción</label>
          <textarea
            id="product-description"
            required
            maxLength={255}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>


        {!loading && !error && categories.length === 0 && (
          <p className={panel.texto}>
            Primero creá una categoría para poder agregar productos.
          </p>
        )}

        <div className={styles.formActions}>
            <button
              type="submit"
              className={panel.boton}
              disabled={loading || saving || selectedCategoryIds.length === 0}
            >
              {saving ? 'Guardando…' : 'Guardar producto'}
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
        </div>
      </form>


      {loading && <p className={panel.texto}>Cargando productos…</p>}

      {error && (
        <p className={panel.error} role="alert">{error}</p>
      )}

      {!loading && !error && products.length === 0 && (
        <p className={panel.texto}>Todavía no hay productos.</p>
      )}

      <ul className={styles.list}>
        {products.map((product) => (
          <li key={product.id} className={styles.row}>
            <div className={styles.productInfo}>
              <strong>{product.nombre}</strong>

              <span>
                Precio: ${Number(product.precio).toFixed(2)}
                {' — '}Stock: {product.cantidad}
              </span>

              <span>
                Categorías: {product.categorias
                  .map((category) => category.nombre)
                  .join(', ') || 'Sin categoría'}
              </span>
            </div>

            <div className={styles.actions}>

              <button
                type="button"
                className={styles.iconButton}
                disabled={saving}
                onClick={() => handleEdit(product)}
                aria-label={`Editar ${product.nombre}`}
                title="Editar producto"
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
                onClick={() => handleDelete(product)}
                aria-label={`Eliminar ${product.nombre}`}
                title="Eliminar producto"
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