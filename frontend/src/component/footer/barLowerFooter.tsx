import styles from './footer.module.css';

export default function BarLowerFooter() {
  const year = new Date().getFullYear();

  return (
    <div className={styles.barraInferior}>
      <div className={styles.redes}>
        <a href="https://instagram.com" target="_blank" rel="noreferrer" className={styles.redLink}>
          Instagram
        </a>
        <a href="https://wa.me/" target="_blank" rel="noreferrer" className={styles.redLink}>
          WhatsApp
        </a>
      </div>

      <p className={styles.derechos}>
        © {year} E-Commerce. Todos los derechos reservados.
      </p>
    </div>
  );
}