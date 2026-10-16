import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '../../../context/catalogContext/useCatalog';
import styles from './categoryCarousel.module.css';

export default function CategoryCarousel() {
  const { categories } = useCatalog();
  const [current, setCurrent] = useState(0);
  const total = categories.length;

  if (total === 0) return null; // sin categorías (o todavía cargando) no hay nada que mostrar

  // El resto (%) hace que después de la última vuelva a la primera, y al revés.
  const prev = () => setCurrent(index => (index - 1 + total) % total);
  const next = () => setCurrent(index => (index + 1) % total);

  return (
    <section className={styles.section}>
      <button type="button" className={styles.arrow} onClick={prev} aria-label="Anterior">‹</button>

      <div className={styles.viewport}>
        {/* El carril se desplaza de a 100% (un slide) con una transición suave */}
        <div className={styles.track} style={{ transform: `translateX(-${current * 100}%)` }}>
          {categories.map(category => (
            <div key={category.id} className={styles.slide}>
              <h2 className={styles.title}>{category.nombre}</h2>
              <Link to={`/categorias?categoria=${category.id}`} className={styles.button}>
                Ver productos
              </Link>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className={styles.arrow} onClick={next} aria-label="Siguiente">›</button>
    </section>
  );
}