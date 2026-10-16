import { brands } from '../brands';
import styles from './brandsSection.module.css';

export default function BrandsSection() {
  return (
    <section className={styles.section}>
      <ul className={styles.list}>
        {brands.map(brand => (
          <li key={brand.id} className={styles.circle}>
            <img src={brand.image} alt={brand.nombre} className={styles.logo} />
          </li>
        ))}
      </ul>
    </section>
  );
}