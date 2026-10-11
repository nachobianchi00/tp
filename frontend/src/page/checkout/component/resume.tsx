// src/page/checkout/component/resumen.tsx
import { useCart } from '../../../context/cartContext/useCart';
import type { DeliveryData } from '../../../type/deliveryData';
import type { PayData } from '../../../type/payData';
import styles from './resume.module.css';

interface ResumenProps {
  entregaData: DeliveryData;
  payData: PayData;
}

export default function Resumen({ entregaData, payData }: ResumenProps) {
  const { items, totalPrice } = useCart();

  const costoEnvio = entregaData.metodoEnvio?.price ?? 0;
  const total = totalPrice + costoEnvio;

  const puedeConfirmar =
    items.length > 0 && entregaData.metodoEnvio !== null && payData.payMethod !== null;

  function handleConfirmar() {
    if (!puedeConfirmar) return;
    console.log('Pedido confirmado:', { items, entregaData, payData, total });
    // más adelante, acá se dispara el pedido real al backend
  }

  return (
    <section className={styles.container}>
      <h2 className={styles.titulo}>Resumen del pedido</h2>

      <div className={styles.listaItems}>
        {items.map((item) => (
          <div key={item.product.id} className={styles.itemFila}>
            <span>{item.quantity} x {item.product.name}</span>
            <span>${item.quantity * item.product.price}</span>
          </div>
        ))}
      </div>

      <div className={styles.detalleFila}>
        <span>Subtotal</span>
        <span>${totalPrice}</span>
      </div>
      <div className={styles.detalleFila}>
        <span>Envío ({entregaData.metodoEnvio?.description ?? '—'})</span>
        <span>${costoEnvio}</span>
      </div>
      <div className={styles.detalleTotal}>
        <span>Total</span>
        <span>${total}</span>
      </div>

      <p className={styles.metodoPagoTexto}>
        Pago: {payData.payMethod?.descripcion ?? 'No seleccionado'}
      </p>

      <button
        onClick={handleConfirmar}
        disabled={!puedeConfirmar}
        className={styles.botonConfirmar}
      >
        Confirmar pedido
      </button>

      {!puedeConfirmar && (
        <p className={styles.avisoIncompleto}>
          Completá entrega y pago para poder confirmar.
        </p>
      )}
    </section>
  );
}