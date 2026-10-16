import { Link } from 'react-router-dom';
import { productImage } from '../../../util/productImage';
import type { ProductType } from '../../../type/productType';
import styles from './productGrid.module.css';

interface ProductGridProps {
  products: ProductType[];
  emptyMessage: string;
}

export default function ProductGrid({ products, emptyMessage }: ProductGridProps) {
  if (products.length === 0) {
    return <p className={styles.vacio}>{emptyMessage}</p>;
  }

  return (
    <div className={styles.grid}>
      {products.map((p) => (
        <Link key={p.id} to={`/producto/${p.id}`} className={styles.card}>
          <img src={productImage(p.nombre)} alt={p.nombre} className={styles.imagen} />
          <p className={styles.nombre}>{p.nombre}</p>
          <p className={styles.precio}>${p.precio}</p>
          <p className={styles.stock}>Stock: {p.cantidad}</p>
        </Link>
      ))}
    </div>
  );
}