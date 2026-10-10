import BarTopFooter from './barTopFooter';
import BarLowerFooter from './barLowerFooter';
import styles from './footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <BarTopFooter />
      <BarLowerFooter />
    </footer>
  );
}