import { Link } from 'react-router-dom';
import Navegator from './navegator';
import { useCart } from '../../../context/cartContext/useCart';
import styles from '../header.module.css';
import logo from '../../../asset/image/logo.webp';
import userIcon from '../../../asset/image/icons/user.svg';
import cartIcon from '../../../asset/image/icons/cart.svg';

export default function BarTop() {
  const { totalItems } = useCart();

  return (
    <div className={styles.barraSuperior}>
      <Link to="/" className={styles.logoLink}>
        <img src={logo} alt="Logo" className={styles.logo} />
      </Link>

      <Navegator />

      <div className={styles.acciones}>
        <Link to="/mi-cuenta" className={styles.usuarioLink}>
          <img src={userIcon} alt="" className={styles.iconUsuario} />
          <span>Mi cuenta</span>
        </Link>

        <Link to="/carrito" className={styles.carritoBoton}>
          <img src={cartIcon} alt="" className={styles.iconCarrito} />
          <span className={styles.carritoTexto}>Carrito</span>
          {totalItems > 0 && <span className={styles.badge}>{totalItems}</span>}
        </Link>
      </div>
    </div>
  );
}