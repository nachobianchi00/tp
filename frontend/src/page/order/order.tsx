import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCatalog } from '../../context/catalogContext/useCatalog';
import { getOrder } from '../../service/order.service';
import type { PedidoType } from '../../type/pedidoType';
import styles from './order.module.css';

// Datos de ejemplo: reemplazar por los reales del negocio.
const TRANSFER_METHOD = 'Transferencia bancaria';
const BANK = {
  titular: 'E-COMMERCE DSW',
  banco: 'Banco Macro',
  cbu: '00000031**************',
  alias: 'leo.lautaro.nacho.ignacio',
  cuit: '30-12345678-9',
};

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

  useEffect(() => {
    getOrder(Number(id)).then(setOrder).catch(() => setError(true));
  }, [id]);

  if (error) return <p>No encontramos ese pedido.</p>;
  if (!order) return <p>Cargando…</p>;

  const showTransfer = order.metodoPago.descripcion === TRANSFER_METHOD && order.estado === 'pendiente';

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
        <div className={styles.check}>✓</div>
        <h1 className={styles.titulo}>¡Recibimos tu pedido #{order.id}!</h1>
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
          <span>Envío ({order.metodoEnvio.descripcion})</span>
          <span>${order.metodoEnvio.costo}</span>
        </div>
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
            <li>En concepto escribí "Pedido"+(número de pedido):<strong>"Pedido{order.id}"</strong>.</li>
            <li>Guardá el comprobante: lo vas a subir a tu pedido para que verifiquemos el pago.</li>
            <li>Cuando confirmemos el pago, tu pedido pasa a <strong>confirmado</strong>.</li>
          </ol>
        </section>
      )}

      <Link to="/mi-cuenta" className={styles.link}>Ir a mi cuenta</Link>
    </div>
  );
}