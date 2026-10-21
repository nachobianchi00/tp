import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoriaService } from '../../service/categoria.service';
import type { CategoryType } from '../../type/categoryType';
import logo from '../../asset/image/logo.webp';
import styles from './footer.module.css';

export default function BarTopFooter() {
  const [categories, setCategories] = useState<CategoryType[]>([]);

  useEffect(() => {
    let cancelled = false;
    categoriaService.getAll()
      .then((list) => { if (!cancelled) setCategories(list); })
      .catch(() => { /* Las categorías del footer son opcionales: si fallan, no se muestran. */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.barraSuperior}>
      <Link to="/" className={styles.logoLink}>
        <img src={logo} alt="Logo" className={styles.logo} />
      </Link>

      <div className={styles.columnas}>
        <div className={styles.columna}>
          <h3 className={styles.columnaTitulo}>Categorías</h3>
          {categories.map((category) => (
            <span key={category.id} className={styles.columnaItem}>
              {category.name}
            </span>
          ))}
        </div>

        <div className={styles.columna}>
          <h3 className={styles.columnaTitulo}>Páginas</h3>
          <Link to="/" className={styles.columnaLink}>Inicio</Link>
          <Link to="/catalogo" className={styles.columnaLink}>Catálogo</Link>
          <Link to="/contacto" className={styles.columnaLink}>Contacto</Link>
          <Link to="/mi-cuenta" className={styles.columnaLink}>Mi cuenta</Link>
        </div>
      </div>
    </div>
  );
}