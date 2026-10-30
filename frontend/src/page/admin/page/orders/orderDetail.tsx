import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCatalog } from '../../../../context/catalogContext/useCatalog';
import { HttpError } from '../../../../service/http';
import { changeOrderState, deleteOrder, getOrder } from '../../../../service/order.service';
import type { OrderAction } from '../../../../service/order.service';
import type { PedidoEstado, PedidoType } from '../../../../type/pedidoType';
import styles from './orderDetail.module.css';

interface ActionConfig {
  texto: string;
  pregunta: string;
  peligro?: boolean;
}

const ACCIONES: Record<OrderAction, ActionConfig> = {
  confirmar: { texto: 'Confirmar pedido', pregunta: '¿Confirmar el pedido? Se descuenta el stock de los productos.' },
  entregar: { texto: 'Marcar como entregado', pregunta: '¿Marcar el pedido como entregado?' },
  cancelar: { texto: 'Cancelar pedido', pregunta: '¿Cancelar el pedido? Si estaba confirmado, se devuelve el stock.', peligro: true },
};

// Qué acciones se ofrecen según el estado actual (el backend vuelve a validarlas).
const ACCIONES_POR_ESTADO: Record<PedidoEstado, OrderAction[]> = {
  pendiente: ['confirmar', 'cancelar'],
  confirmado: ['entregar', 'cancelar'],
  entregado: [],
  cancelado: [],
};

// Solo se borran pedidos que no movieron stock ni son historial de ventas.
const SE_PUEDE_ELIMINAR: PedidoEstado[] = ['pendiente', 'cancelado'];

function errorText(error: unknown) {
  return error instanceof HttpError && error.status === 409
    ? 'No se pudo completar: el pedido cambió de estado o no hay stock suficiente.'
    : 'No se pudo completar la acción. Intentá de nuevo.';
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { products } = useCatalog();
  const [order, setOrder] = useState<PedidoType | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // La lista manda su filtro (?estado=...) para que "Volver" deje la lista como estaba.
  const search = (location.state as { search?: string } | null)?.search;
  const volver = search ? `/admin/pedidos?${search}` : '/admin/pedidos';

  useEffect(() => {
    getOrder(Number(id)).then(setOrder).catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <p>No encontramos ese pedido. <Link to={volver}>Volver a pedidos</Link></p>;
  if (!order) return <p>Cargando…</p>;

  async function handleAction(action: OrderAction) {
    if (!order || !window.confirm(ACCIONES[action].pregunta)) return;
    setBusy(true);
    setMessage('');
    try {
      await changeOrderState(order.id, action);
      setOrder(await getOrder(order.id)); // se vuelve a pedir para mostrar el estado real
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!order || !window.confirm('¿Eliminar el pedido definitivamente? No se puede deshacer.')) return;
    setBusy(true);
    setMessage('');
    try {
      await deleteOrder(order.id);
      navigate(volver, { replace: true });
    } catch (error) {
      setMessage(errorText(error));
      setBusy(false);
    }
  }

  const acciones = ACCIONES_POR_ESTADO[order.estado];
  const subtotal = order.detallePedido.reduce((suma, d) => suma + d.cantidad * d.precioUnitario, 0);

  return (
    <div>
      <Link to={volver} className={styles.volver}>← Volver a pedidos</Link>

      <header className={styles.encabezado}>
        <div>
          <h1 className={styles.title}>Pedido #{order.id}</h1>
          <span className={styles.fecha}>{new Date(order.fechaCreacion).toLocaleString('es-AR')}</span>
        </div>
        <span className={`${styles.estado} ${styles[order.estado]}`}>{order.estado}</span>
      </header>

      <section className={styles.card}>
        <h2 className={styles.subtitulo}>Cliente</h2>
        <dl className={styles.datos}>
          <dt>Nombre</dt><dd>{order.cliente.nombre} {order.cliente.apellido}</dd>
          <dt>DNI</dt><dd>{order.cliente.dni}</dd>
          <dt>Correo</dt><dd>{order.cliente.mail}</dd>
          <dt>Teléfono</dt><dd>{order.cliente.telefono}</dd>
          <dt>Dirección</dt><dd>{order.cliente.direccion}</dd>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.subtitulo}>Entrega y pago</h2>
        <dl className={styles.datos}>
          <dt>Envío</dt><dd>{order.metodoEnvio.descripcion}</dd>
          <dt>Pago</dt><dd>{order.metodoPago.descripcion}</dd>
          {order.observacion && <><dt>Observación</dt><dd>{order.observacion}</dd></>}
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.subtitulo}>Productos</h2>
        <ul className={styles.productos}>
          {order.detallePedido.map((d) => (
            <li key={d.id} className={styles.producto}>
              <span>{d.cantidad} x {products.find((p) => p.id === d.producto)?.nombre ?? `Producto #${d.producto}`}</span>
              <span>${(d.cantidad * d.precioUnitario).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.totales}>
          <dt>Subtotal</dt><dd>${subtotal.toFixed(2)}</dd>
          <dt>Envío</dt><dd>${order.metodoEnvio.costo.toFixed(2)}</dd>
          <dt className={styles.total}>Total</dt><dd className={styles.total}>${order.total.toFixed(2)}</dd>
        </dl>
      </section>

      {message && <p className={styles.error} role="alert">{message}</p>}

      <div className={styles.acciones}>
        {acciones.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            className={ACCIONES[action].peligro ? `${styles.boton} ${styles.peligro}` : styles.boton}
            onClick={() => handleAction(action)}
          >
            {ACCIONES[action].texto}
          </button>
        ))}
        {SE_PUEDE_ELIMINAR.includes(order.estado) && (
          <button type="button" disabled={busy} className={`${styles.boton} ${styles.peligro}`} onClick={handleDelete}>
            Eliminar pedido
          </button>
        )}
      </div>
    </div>
  );
}