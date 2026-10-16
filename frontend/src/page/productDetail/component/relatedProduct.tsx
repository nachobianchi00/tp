import { Link } from 'react-router-dom';
import { productImage } from '../../../util/productImage';
import { products } from '../../../mock/products';
import type { ProductType } from '../../../type/productType';
import styles from './relatedProduct.module.css';

interface RelatedProductProps {
  currentProduct: ProductType;
}

export default function RelatedProduct({ currentProduct }: RelatedProductProps) {
  const related = products.filter(
    (p) =>
      p.id !== currentProduct.id &&
      p.categorias.some((c) => currentProduct.categorias.some((cc) => cc.id === c.id))
  );

  if (related.length === 0) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.titulo}>Productos relacionados</h3>
      <div className={styles.grid}>
        {related.map((p) => (
          <Link key={p.id} to={`/producto/${p.id}`} className={styles.card}>
            <img src={productImage(p.nombre)} alt={p.nombre} className={styles.imagen} />
            <p className={styles.nombre}>{p.nombre}</p>
            <p className={styles.precio}>${p.precio}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}