import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/authContext/useAuth';
import { getClient } from '../../service/client.service';
import type { ClientProfile } from '../../type/clientType';
import AccountSidebar from './component/accountSidebar';
import styles from './myAccount.module.css';

// Parte fija (menú de la izquierda) + parte móvil (la página hija, en el <Outlet />)
export default function MyAccount() {
  const { identity } = useAuth();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (identity) getClient(identity.id).then(setClient).catch(() => setError(true));
  }, [identity]);

  // Las páginas hijas lo llaman después de guardar, para refrescar los datos
  async function reload() {
    if (identity) setClient(await getClient(identity.id));
  }

  if (error) return <p>No pudimos cargar tu cuenta.</p>;
  if (!client) return <p>Cargando…</p>;

  return (
    <div className={styles.layout}>
      <AccountSidebar name={`${client.nombre} ${client.apellido}`} />
      <section className={styles.panel}>
        <Outlet context={{ client, reload }} />
      </section>
    </div>
  );
}