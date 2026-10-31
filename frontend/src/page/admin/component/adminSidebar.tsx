import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/authContext/useAuth';
import styles from './adminSidebar.module.css';

function itemClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${styles.item} ${styles.active}` : styles.item;
}

export default function AdminSidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    if (!window.confirm('¿Seguro que desea salir de su cuenta?')) return;
    navigate('/admin/login', { replace: true }); // primero a inicio, para que la ruta protegida no mande al login
    await logout();
  }

  return (
    <aside className={styles.sidebar}>
      <p className={styles.nombre}>Panel de administración</p>

      <nav className={styles.menu}>
        {/* Acá se va agregando un <NavLink> por cada pantalla nueva */}
        <NavLink to="/admin/pedidos" className={itemClass}>
          <svg className={styles.icono} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          Pedidos
        </NavLink>

      <NavLink to="/admin/categorias" className={itemClass}>
        <svg
          className={styles.icono}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
        </svg>
        Categorías
      </NavLink>

      <NavLink to="/admin/metodos-pago" className={itemClass}>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </svg>
        Métodos de pago
      </NavLink>

      <NavLink to="/admin/productos" className={itemClass}>
        <svg
          className={styles.icono}
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
          <circle cx="7" cy="7" r="1" fill="currentColor" />
        </svg>
        Productos
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