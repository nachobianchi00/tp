import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyOrders } from '../../../../service/order.service';
import type { PedidoType } from '../../../../type/pedidoType';
import panel from '../../accountPanel.module.css';
import styles from './myOrders.module.css';

export default function MyOrders() {
  const [orders, setOrders] = useState<PedidoType[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMyOrders().then(setOrders).catch(() => setError(true));
  }, []);

  return (
    <>
      <h1 className={panel.titulo}>Mis pedidos</h1>

      {error && <p className={panel.error}>No pudimos cargar tus pedidos.</p>}
      {!error && !orders && <p className={panel.texto}>Cargando…</p>}
      {orders && orders.length === 0 && (
        <p className={panel.texto}>Todavía no hiciste ningún pedido.</p>
      )}

      {orders && orders.length > 0 && (
        <ul className={styles.lista}>
          {orders.map((o) => (
            <li key={o.id} className={styles.fila}>
              <div className={styles.numero}>
                <strong>Pedido #{o.id}</strong>
                <span className={styles.fecha}>{new Date(o.fechaCreacion).toLocaleDateString('es-AR')}</span>
              </div>
              <span className={styles.total}>${o.total}</span>
              <span className={`${styles.estado} ${styles[o.estado]}`}>{o.estado}</span>
              <Link to={`/pedido/${o.id}`} className={`${panel.boton} ${panel.secundario}`}>
                Abrir pedido
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}