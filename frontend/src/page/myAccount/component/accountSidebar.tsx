import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/authContext/useAuth';
import styles from './accountSidebar.module.css';

function itemClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${styles.item} ${styles.active}` : styles.item;
}

export default function AccountSidebar({ name }: { name: string }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

async function handleLogout() {
  if (!window.confirm('¿Seguro que desea salir de su cuenta?')) return;
  navigate('/', { replace: true }); // primero a inicio, para que la ruta protegida no mande al login
  await logout();
}
  return (
    <aside className={styles.sidebar}>
      <p className={styles.nombre}>{name}</p>

      <nav className={styles.menu}>
        <NavLink to="/mi-cuenta/pedidos" className={itemClass}>
          <svg className={styles.icono} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          Mis pedidos
        </NavLink>

        <NavLink to="/mi-cuenta/datos" className={itemClass}>
          <svg className={styles.icono} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
          Mis datos
        </NavLink>

        <button type="button" className={styles.item} onClick={handleLogout}>
          <svg className={styles.icono} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Cerrar sesión
        </button>
      </nav>
    </aside>
  );
}