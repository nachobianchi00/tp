import { Link } from 'react-router-dom';
import Navegator from './navegator';
import AccountMenu from '../../accountMenu/accountMenu';
import { useCart } from '../../../context/cartContext/useCart';
import styles from '../header.module.css';
import logo from '../../../asset/image/logo.webp';
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
        <AccountMenu />

        <Link to="/carrito" className={styles.carritoBoton}>
          <img src={cartIcon} alt="" className={styles.iconCarrito} />
          <span className={styles.carritoTexto}>Carrito</span>
          {totalItems > 0 && <span className={styles.badge}>{totalItems}</span>}
        </Link>
      </div>
    </div>
  );
}