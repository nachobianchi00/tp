// src/component/footer/barTopFooter.tsx
import { Link } from 'react-router-dom';
import { categories } from '../../mock/categories';
import logo from '../../asset/image/logo.webp';
import styles from './footer.module.css';

export default function BarTopFooter() {
  return (
    <div className={styles.barraSuperior}>
      <Link to="/" className={styles.logoLink}>
        <img src={logo} alt="Logo" className={styles.logo} />
      </Link>

      <div className={styles.columnas}>
        <div className={styles.columna}>
          <h3 className={styles.columnaTitulo}>Categorías</h3>
          {categories.map((category) => (
            <Link
              key={category.id}
              to={`/categorias?categoria=${category.id}`}
              className={styles.columnaLink}
            >
              {category.nombre}
            </Link> 
          ))}
        </div>

        <div className={styles.columna}>
          <h3 className={styles.columnaTitulo}>Páginas</h3>
          <Link to="/" className={styles.columnaLink}>Inicio</Link>
          <Link to="/categorias" className={styles.columnaLink}>Categorías</Link>
          <Link to="/contacto" className={styles.columnaLink}>Contacto</Link>
          <Link to="/mi-cuenta" className={styles.columnaLink}>Mi cuenta</Link>
        </div>
      </div>
    </div>
  );
}