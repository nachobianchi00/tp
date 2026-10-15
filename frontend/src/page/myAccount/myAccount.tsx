import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/authContext/useAuth';
import styles from './myAccount.module.css';

export default function MyAccount() {
  const {
    identity: identidad,
    checking: comprobandoSesion,
    submitting: enviando,
    error,
    deleteOwnAccount: eliminarCuentaPropia,
    refreshSession: actualizarSesion,
  } = useAuth();
  const [pidiendoConfirmacion, establecerConfirmacion] = useState(false);
  const navegar = useNavigate();
  const deshabilitado = comprobandoSesion || enviando;

  async function confirmarEliminacion() {
    if (!pidiendoConfirmacion || deshabilitado) return;
    if (await eliminarCuentaPropia()) navegar('/', { replace: true });
  }

  return (
    <section className={styles.container} aria-busy={deshabilitado}>
      <h1>Mi cuenta</h1>
      {comprobandoSesion && <p role="status">Comprobando sesión…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!comprobandoSesion && !identidad && <p><Link to="/login">Iniciar sesión</Link> para acceder a tu cuenta.</p>}
      {identidad && <p>Cuenta: {identidad.tipo === 'cliente' ? 'Cliente' : 'Administrador'} · ID: {identidad.id}</p>}

      {identidad?.tipo === 'cliente' && (
        <div>
          <h2>Eliminar mi cuenta</h2>
          <p>La eliminación es definitiva. Solo podés eliminar tu cuenta si no tiene pedidos registrados.</p>
          {pidiendoConfirmacion ? (
            <div className={styles.confirmation}>
              <p id="delete-warning">¿Confirmás que querés eliminar tu cuenta definitivamente?</p>
              <div className={styles.actions}>
                <button className={styles.danger} type="button" disabled={deshabilitado}
                  aria-describedby="delete-warning" onClick={() => void confirmarEliminacion()}>
                  {enviando ? 'Eliminando…' : 'Sí, eliminar definitivamente'}
                </button>
                <button type="button" disabled={deshabilitado} onClick={() => establecerConfirmacion(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button className={styles.danger} type="button" disabled={deshabilitado} onClick={() => establecerConfirmacion(true)}>
              Eliminar mi cuenta
            </button>
          )}
        </div>
      )}
      {error && <button type="button" disabled={deshabilitado} onClick={() => void actualizarSesion()}>Comprobar sesión</button>}
    </section>
  );
}
