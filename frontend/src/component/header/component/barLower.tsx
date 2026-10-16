import { NavLink } from 'react-router-dom';
import styles from '../header.module.css';

export default function BarLower() {
  return (
    <nav className={styles.barraReferencias}>
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          isActive ? `${styles.referenciaLink} ${styles.referenciaActiva}` : styles.referenciaLink
        }
      >
        Inicio
      </NavLink>

      <NavLink
        to="/categorias"
        className={({ isActive }) =>
          isActive ? `${styles.referenciaLink} ${styles.referenciaActiva}` : styles.referenciaLink
        }
      >
        Categorías
      </NavLink>

      {/*<NavLink
        to="/contacto"
        className={({ isActive }) =>
          isActive ? `${styles.referenciaLink} ${styles.referenciaActiva}` : styles.referenciaLink
        }
      >
        Contacto
      </NavLink>*/}

      {/*<NavLink
        to="/sobre-nosotros"
        className={({ isActive }) =>
          isActive ? `${styles.referenciaLink} ${styles.referenciaActiva}` : styles.referenciaLink
        }
      >
        Sobre nosotros
      </NavLink>*/}

    </nav>
  );
}