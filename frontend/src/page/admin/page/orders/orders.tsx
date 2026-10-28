import styles from './orders.module.css';

export default function Orders() {
  return (
    <div>
      <h1 className={styles.title}>Pedidos</h1>
      <p className={styles.empty}>Acá van a aparecer los pedidos.</p>
    </div>
  );
}