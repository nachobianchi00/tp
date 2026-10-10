import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/cartContext/useCart';
import styles from './cart.module.css';

export default function Cart() {
  const { items, removeFromCart, updateQuantity, totalPrice } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className={styles.vacio}>
        <p>Tu carrito está vacío.</p>
        <Link to="/" className={styles.volverLink}>Ir a comprar</Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Carrito</h1>

      <div className={styles.contenido}>
        <div className={styles.listaProductos}>
          {items.map((item) => (
            <div key={item.product.id} className={styles.itemCard}>
              <img src={item.product.image} alt={item.product.name} className={styles.itemImagen} />

              <div className={styles.itemInfo}>
                <p className={styles.itemNombre}>{item.product.name}</p>
                <p className={styles.itemPrecio}>${item.product.price}</p>
              </div>

              <div className={styles.selectorCantidad}>
                <button
                  onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  className={styles.botonCantidad}
                >
                  −
                </button>
                <span className={styles.cantidad}>{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                  className={styles.botonCantidad}
                >
                  +
                </button>
              </div>

              <button onClick={() => removeFromCart(item.product.id)} className={styles.eliminarBoton}>
                Eliminar
              </button>
            </div>
          ))}
        </div>

        <div className={styles.detalleCompra}>
          <h2 className={styles.detalleTitulo}>Detalle de compra</h2>

          <div className={styles.detalleFila}>
            <span>Subtotal</span>
            <span>${totalPrice}</span>
          </div>
          <div className={styles.detalleFila}>
            <span>Envío</span>
            <span>A calcular</span>
          </div>
          <div className={styles.detalleTotal}>
            <span>Total</span>
            <span>${totalPrice}</span>
          </div>

          <div className={styles.botones}>
            <button onClick={() => navigate('/')} className={styles.botonCancelar}>
              Cancelar
            </button>
            <button onClick={() => navigate('/checkout')} className={styles.botonComprar}>
              Comprar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}