import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/authContext/useAuth';
import userIcon from '../../../asset/image/icons/user.svg';
import headerStyles from '../header.module.css';
import styles from './accountMenu.module.css';

export default function AccountMenu() {
  const { identity, checking, submitting, error, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function closeMenu() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(event: PointerEvent) {
      // pointerdown contempla tanto el mouse como el toque en pantallas móviles.
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleLogout() {
    closeMenu();
    void logout();
  }

  return (
    <div ref={container} className={styles.container} onBlur={event => {
      // Al salir con Tab también se cierra, sin impedir navegar entre las opciones.
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
      }
    }}>
      <button ref={trigger} type="button" className={`${headerStyles.usuarioLink} ${styles.trigger}`}
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(previous => !previous)}>
        <img src={userIcon} alt="" className={headerStyles.iconUsuario} />
        <span>Mi cuenta</span>
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        {checking ? (
          <p className={styles.identity} role="status">Comprobando sesión…</p>
        ) : identity ? (
          <>
            <p className={styles.identity}>
              <strong>{identity.tipo === 'admin' ? 'Administrador' : 'Cliente'}</strong>
              <span>ID: {identity.id}</span>
            </p>
            <button type="button" className={styles.option} disabled={submitting} onClick={handleLogout}>
              {submitting ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </>
        ) : (
          <>
            <Link className={styles.option} to="/login" onClick={closeMenu}>Iniciar sesión</Link>
            <Link className={styles.option} to="/registro" onClick={closeMenu}>Registrarse</Link>
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  );
}