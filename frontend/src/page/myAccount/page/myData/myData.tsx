import { Link, useLocation, useOutletContext } from 'react-router-dom';
import type { AccountOutletContext } from '../../../../type/clientType';
import styles from '../../accountPanel.module.css';

export default function MyData() {
  const { client } = useOutletContext<AccountOutletContext>();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;

  const datos: [string, string | number][] = [
    ['Nombre', client.nombre],
    ['Apellido', client.apellido],
    ['DNI', client.dni],
    ['Dirección', client.direccion],
    ['Teléfono', client.telefono],
    ['Correo electrónico', client.mail],
  ];

  return (
    <>
      <h1 className={styles.titulo}>Mis datos</h1>
      {notice && <p className={styles.aviso} role="status">{notice}</p>}

      <dl className={styles.datos}>
        {datos.map(([label, value]) => (
          <div key={label} className={styles.dato}>
            <dt className={styles.datoLabel}>{label}</dt>
            <dd className={styles.datoValor}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.botones}>
        <Link to="/mi-cuenta/datos/editar" className={styles.boton}>Modificar datos</Link>
        <Link to="/mi-cuenta/datos/contrasena" className={`${styles.boton} ${styles.secundario}`}>Cambiar contraseña</Link>
        <Link to="/mi-cuenta/datos/eliminar" className={`${styles.boton} ${styles.peligro}`}>Eliminar cuenta</Link>
      </div>
    </>
  );
}