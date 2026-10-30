import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getAllOrders } from '../../../../service/order.service';
import type { PedidoEstado, PedidoType } from '../../../../type/pedidoType';
import { normalize } from '../../../../util/normalize';
import styles from './orders.module.css';

const ESTADOS: PedidoEstado[] = ['pendiente', 'confirmado', 'entregado', 'cancelado'];

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function Orders() {
  const [orders, setOrders] = useState<PedidoType[] | null>(null);
  const [error, setError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Los filtros viven en la URL (?id=10&cliente=ana&estado=pendiente):
  // al volver de un detalle se conservan.
  const idBuscado = searchParams.get('id') ?? '';
  const clienteBuscado = searchParams.get('cliente') ?? '';
  const estado = ESTADOS.find((e) => e === searchParams.get('estado'));
  const hayFiltros = Boolean(idBuscado || clienteBuscado || estado);

  useEffect(() => {
    getAllOrders().then(setOrders).catch(() => setError(true));
  }, []);

  function setFiltro(nombre: 'id' | 'cliente' | 'estado', valor: string) {
    const nuevos = new URLSearchParams(searchParams);
    if (valor) nuevos.set(nombre, valor);
    else nuevos.delete(nombre);
    setSearchParams(nuevos, { replace: true }); // replace: tipear no llena el historial
  }

  // "ana gomez" encuentra a "Ana Gómez" (sin importar mayúsculas, tildes ni orden).
  const palabras = normalize(clienteBuscado).split(' ').filter(Boolean);

  const visibles = orders?.filter((o) => {
    const nombreCompleto = normalize(`${o.cliente.nombre} ${o.cliente.apellido}`);
    return (
      (!estado || o.estado === estado) &&
      (!idBuscado || String(o.id) === idBuscado) &&
      palabras.every((palabra) => nombreCompleto.includes(palabra))
    );
  });

  function cantidad(delEstado?: PedidoEstado) {
    return orders?.filter((o) => !delEstado || o.estado === delEstado).length ?? 0;
  }

  return (
    <div>
      <h1 className={styles.title}>Pedidos</h1>

      <div className={styles.filtros}>
        <label className={styles.campo}>
          ID de pedido
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ej: 10"
            value={idBuscado}
            onChange={(e) => setFiltro('id', e.target.value.replace(/\D/g, ''))}
          />
        </label>

        <label className={styles.campo}>
          Cliente
          <input
            type="search"
            placeholder="Nombre o apellido"
            value={clienteBuscado}
            onChange={(e) => setFiltro('cliente', e.target.value)}
          />
        </label>

        <label className={styles.campo}>
          Estado del pedido
          <select value={estado ?? ''} onChange={(e) => setFiltro('estado', e.target.value)}>
            <option value="">Todos ({cantidad()})</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{capitalizar(e)} ({cantidad(e)})</option>
            ))}
          </select>
        </label>

        {hayFiltros && (
          <button type="button" className={styles.limpiar} onClick={() => setSearchParams({}, { replace: true })}>
            Limpiar filtros
          </button>
        )}
      </div>

      {error && <p className={styles.error}>No pudimos cargar los pedidos.</p>}
      {!error && !orders && <p className={styles.empty}>Cargando…</p>}
      {visibles && visibles.length === 0 && <p className={styles.empty}>No hay pedidos para mostrar.</p>}

      {visibles && visibles.length > 0 && (
        <ul className={styles.lista}>
          {visibles.map((o) => (
            <li key={o.id} className={styles.fila}>
              <div className={styles.numero}>
                <strong>Pedido #{o.id}</strong>
                <span className={styles.fecha}>{new Date(o.fechaCreacion).toLocaleDateString('es-AR')}</span>
              </div>
              <div className={styles.cliente}>
                <span>{o.cliente.nombre} {o.cliente.apellido}</span>
                <span className={styles.fecha}>{o.metodoEnvio.descripcion}</span>
              </div>
              <span className={styles.total}>${o.total}</span>
              <span className={`${styles.estado} ${styles[o.estado]}`}>{o.estado}</span>
              {/* Se mandan los filtros actuales para que el detalle pueda volver a la misma lista */}
              <Link to={`/admin/pedidos/${o.id}`} state={{ search: searchParams.toString() }} className={styles.ver}>
                Ver pedido
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}