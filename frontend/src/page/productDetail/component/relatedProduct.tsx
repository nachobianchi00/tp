import { Link } from 'react-router-dom';
import { products } from '../../../mock/products';
import type { ProductType } from '../../../type/productType';
import styles from './relatedProduct.module.css';

interface RelatedProductProps {
  currentProduct: ProductType;
}

export default function RelatedProduct({ currentProduct }: RelatedProductProps) {
  const related = products.filter(
    (p) => p.category.id === currentProduct.category.id && p.id !== currentProduct.id
  );

  if (related.length === 0) return null;

  return (
    <section className={styles.container}>
      <h3 className={styles.titulo}>Productos relacionados</h3>
      <div className={styles.grid}>
        {related.map((p) => (
          <Link key={p.id} to={`/producto/${p.id}`} className={styles.card}>
            <img src={p.image} alt={p.name} className={styles.imagen} />
            <p className={styles.nombre}>{p.name}</p>
            <p className={styles.precio}>${p.price}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}