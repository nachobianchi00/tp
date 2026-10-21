// src/page/checkout/component/resumen.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/cartContext/useCart';
import { HttpError } from '../../../service/http';
import { createOrder } from '../../../service/order.service';
import type { DeliveryData } from '../../../type/deliveryData';
import type { PayData } from '../../../type/payData';
import styles from './resume.module.css';

interface ResumenProps {
  entregaData: DeliveryData;
  payData: PayData;
}

export default function Resumen({ entregaData, payData }: ResumenProps) {
  const { items, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const costoEnvio = entregaData.metodoEnvio?.costo ?? 0;
  const total = totalPrice + costoEnvio;

  const puedeConfirmar =
    items.length > 0 && entregaData.metodoEnvio !== null && payData.metodoPago !== null;

  async function handleConfirmar() {
    if (!puedeConfirmar || sending) return;
    setSending(true);
    setError('');
    try {
      const id = await createOrder(items, entregaData, payData);
      clearCart();
      navigate(`/pedido/${id}`, { replace: true });
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) setError('Tu sesión expiró. Volvé a iniciar sesión.');
      else if (e instanceof HttpError && e.status === 409) setError('Algún producto ya no tiene stock suficiente. Revisá tu carrito.');
      else setError('No pudimos crear el pedido. Intentá de nuevo.');
      setSending(false);
    }
  }

  return (
    <section className={styles.container}>
      <h2 className={styles.titulo}>Resumen del pedido</h2>

      <div className={styles.listaItems}>
        {items.map((item) => (
          <div key={item.product.id} className={styles.itemFila}>
            <span>{item.quantity} x {item.product.nombre}</span>
            <span>${item.quantity * item.product.precio}</span>
          </div>
        ))}
      </div>

      <div className={styles.detalleFila}>
        <span>Subtotal</span>
        <span>${totalPrice}</span>
      </div>
      <div className={styles.detalleFila}>
        <span>Envío ({entregaData.metodoEnvio?.descripcion ?? '—'})</span>
        <span>${costoEnvio}</span>
      </div>
      <div className={styles.detalleTotal}>
        <span>Total</span>
        <span>${total}</span>
      </div>

      <p className={styles.metodoPagoTexto}>
        Pago: {payData.metodoPago?.descripcion ?? 'No seleccionado'}
      </p>

      <button
        onClick={handleConfirmar}
        disabled={!puedeConfirmar || sending}
        className={styles.botonConfirmar}
      >
        {sending ? 'Confirmando…' : 'Confirmar pedido'}
      </button>

      {error && <p className={styles.avisoIncompleto}>{error}</p>}

      {!puedeConfirmar && (
        <p className={styles.avisoIncompleto}>
          Completá entrega y pago para poder confirmar.
        </p>
      )}
    </section>
  );
}