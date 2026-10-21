import styles from '../../accountPanel.module.css';

export default function MyOrders() {
  return (
    <>
      <h1 className={styles.titulo}>Mis pedidos</h1>
      <p className={styles.texto}>Pronto vas a poder ver acá tus pedidos y su estado.</p>
    </>
  );
}