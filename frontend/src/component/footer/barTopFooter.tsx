// src/component/footer/barTopFooter.tsx
import { Link } from 'react-router-dom';
import { useCatalog } from '../../context/catalogContext/useCatalog';
import logo from '../../asset/image/logo.webp';
import styles from './footer.module.css';

export default function BarTopFooter() {
  const { categories } = useCatalog();

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
          {/*<Link to="/contacto" className={styles.columnaLink}>Contacto</Link>*/}
          <Link to="/mi-cuenta" className={styles.columnaLink}>Mi cuenta</Link>
        </div>

        <div className={styles.columna} style={{ width: 'min(360px, calc(100vw - 3rem))', maxWidth: '100%' }}>
          <h3 className={styles.columnaTitulo}>Ubicación</h3>
          <span className={styles.columnaItem}>Zeballos 1341, Rosario</span>

          <iframe
            title="Mapa de la UTN Facultad Regional Rosario"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3347.857705273803!2d-60.643801849999996!3d-32.95476605!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95b7ab11d0eb49c3%3A0x11f1d3d54f950dd0!2sUniversidad%20Tecnol%C3%B3gica%20Nacional%20%7C%20Facultad%20Regional%20Rosario!5e0!3m2!1ses-419!2sar!4v1795038737171!5m2!1ses-419!2sar"
            height={250}
            style={{
              width: '100%',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </div>
  );
}