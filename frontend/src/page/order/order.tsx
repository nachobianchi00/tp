import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useCatalog } from '../../context/catalogContext/useCatalog';
import { cancelOrder, getOrder } from '../../service/order.service';
import type { PedidoType } from '../../type/pedidoType';
import styles from './order.module.css';

const TRANSFER_METHOD = 'Transferencia bancaria';
const WHATSAPP = '5493416963476';
const BANK = {
  titular: 'E-COMMERCE DSW',
  banco: 'Banco Macro',
  cbu: '00000031**************',
  alias: 'leo.lautaro.nacho.ignacio',
  cuit: '30-12345678-9',
};

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button type="button" className={styles.copyBoton} onClick={handleCopy}>
      {copied ? '¡Copiado!' : label}
    </button>
  );
}

export default function Order() {
  const { id } = useParams();
  const { products } = useCatalog();
  const [order, setOrder] = useState<PedidoType | null>(null);
  const [error, setError] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const esNuevo = Boolean((useLocation().state as { nuevo?: boolean } | null)?.nuevo);

  useEffect(() => {
    getOrder(Number(id)).then(setOrder).catch(() => setError(true));
  }, [id]);

  if (error) return <p>No encontramos ese pedido.</p>;
  if (!order) return <p>Cargando…</p>;

  async function handleCancel() {
    if (!order || !window.confirm('¿Seguro que querés cancelar este pedido?')) return;
    setCancelling(true);
    setCancelError('');
    try {
      await cancelOrder(order.id);
      setOrder({ ...order, estado: 'cancelado' });
    } catch {
      setCancelError('No pudimos cancelar el pedido. Intentá de nuevo.');
    } finally {
      setCancelling(false);
    }
  }

  const showTransfer = order.metodoPago.descripcion === TRANSFER_METHOD && order.estado === 'pendiente';

  const mensajeWhatsApp = `Hola, te envío el comprobante de pago del Pedido #${order.id} por $${order.total}.`;
  const linkWhatsApp = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensajeWhatsApp)}`;

  const datosTransferencia: [string, string][] = [
    ['Monto', `$${order.total}`],
    ['Alias', BANK.alias],
    ['CBU', BANK.cbu],
    ['Titular', BANK.titular],
    ['CUIT', BANK.cuit],
    ['Banco', BANK.banco],
    ['Concepto', `Pedido #${order.id}`],
  ];

  return (
    <div className={styles.container}>
      <header className={styles.encabezado}>
        {esNuevo && <div className={styles.check}>✓</div>}
        <h1 className={styles.titulo}>
          {esNuevo ? `¡Recibimos tu pedido #${order.id}!` : `Pedido #${order.id}`}
        </h1>
        <p className={styles.subtitulo}>
          <span className={styles.estado}>{order.estado}</span>
          {new Date(order.fechaCreacion).toLocaleString('es-AR')}
        </p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitulo}>Detalle</h2>
        {order.detallePedido.map((d) => (
          <div key={d.id} className={styles.fila}>
            <span>
              {d.cantidad} x {products.find((p) => p.id === d.producto)?.nombre ?? `Producto #${d.producto}`}
            </span>
            <span>${d.cantidad * d.precioUnitario}</span>
          </div>
        ))}
        <div className={styles.fila}>
          <span><strong>Método de envío:</strong> {order.metodoEnvio.descripcion}</span>
          <span>${order.metodoEnvio.costo}</span>
        </div>
        <p className={styles.observacion}>
          <strong>Método de pago:</strong> {order.metodoPago.descripcion}
        </p>
        <div className={`${styles.fila} ${styles.total}`}>
          <span>Total</span>
          <span>${order.total}</span>
        </div>
        {order.observacion && (
          <p className={styles.observacion}>
            <strong>Observación:</strong> {order.observacion}
          </p>
        )}
      </section>

      {showTransfer && (
        <section className={styles.card}>
          <h2 className={styles.cardTitulo}>Datos para la transferencia</h2>
          <dl className={styles.datos}>
            {datosTransferencia.map(([label, value]) => (
              <div key={label} className={styles.dato}>
                <dt className={styles.datoLabel}>{label}</dt>
                <dd className={styles.datoValor}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.botones}>
            <CopyButton text={BANK.cbu} label="Copiar CBU" />
            <CopyButton
              text={datosTransferencia.map(([label, value]) => `${label}: ${value}`).join('\n')}
              label="Copiar todos los datos"
            />
          </div>

          <ol className={styles.pasos}>
            <li>Transferí el monto exacto a la cuenta proporcionada.</li>
            <li>En el concepto escribí <strong>Pedido #{order.id}</strong>.</li>
            <li>Guardá el comprobante: lo vas adjuntar a nuestro WhatsApp para que verifiquemos el pago.</li>
            <li>Cuando confirmemos el pago, tu pedido pasa a estado <strong>"Confirmado"</strong>.</li>
          </ol>
        </section>
      )}

      {order.estado === 'pendiente' && (
        <div className={styles.cancelar}>
          {cancelError && <p className={styles.errorCancelar}>{cancelError}</p>}
          <div className={styles.accionesPedido}>
            {showTransfer && (
              <a href={linkWhatsApp} target="_blank" rel="noreferrer" className={styles.whatsappBoton}>
                <WhatsAppIcon />
                Enviar comprobante por WhatsApp
              </a>
            )}
            <button type="button" className={styles.cancelarBoton} onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelando…' : 'Cancelar pedido'}
            </button>
          </div>
        </div>
      )}

      <Link to="/mi-cuenta/pedidos" className={styles.link}>Volver a mis pedidos</Link>
    </div>
  );
}