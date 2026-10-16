import { useState, useEffect } from 'react';
import { productImage } from '../../../util/productImage';
import { useCart } from '../../../context/cartContext/useCart';
import type { ProductType } from '../../../type/productType';
import styles from './productInfo.module.css';

interface ProductInfoProps {
  product: ProductType;
}

export default function ProductInfo({ product }: ProductInfoProps) {
  const [quantity, setQuantity] = useState(1);
  const [showAdvice, setShowAdvice] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    if (!showAdvice) return;
    const timer = setTimeout(() => setShowAdvice(false), 2500);
    return () => clearTimeout(timer);
  }, [showAdvice]);

  function handleDecrease() {
    setQuantity((prev) => Math.max(1, prev - 1));
  }

  function handleIncrease() {
    setQuantity((prev) => Math.min(product.cantidad, prev + 1));
  }

  function handleAddToCart() {
    addToCart(product, quantity);
    setShowAdvice(true);
  }

  return (
    <section className={styles.container}>
      <p className={styles.categoria}>{product.categorias.map((c) => c.nombre).join(", ")}</p>

      <div className={styles.contenido}>
        <img src={productImage(product.nombre)} alt={product.nombre} className={styles.imagen} />

        <div className={styles.info}>
          <h2 className={styles.nombre}>{product.nombre}</h2>
          <p className={styles.precio}>${product.precio}</p>
          <p className={styles.stock}>Stock disponible: {product.cantidad}</p>

          <div className={styles.selectorCantidad}>
            <button onClick={handleDecrease} className={styles.botonCantidad}>−</button>
            <span className={styles.cantidad}>{quantity}</span>
            <button onClick={handleIncrease} className={styles.botonCantidad}>+</button>
          </div>

          <button onClick={handleAddToCart} className={styles.botonAgregar}>
            Agregar al carrito
          </button>
        </div>
      </div>

      {showAdvice && (
        <div className={styles.toast}>
          ¡Producto agregado al carrito!
        </div>
      )}
    </section>
  );
}