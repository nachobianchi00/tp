import { Outlet } from 'react-router-dom';
import AdminSidebar from './component/adminSidebar';
import styles from './admin.module.css';

export default function Admin() {
  return (
    <div className={styles.layout}>
      <AdminSidebar />
      <section className={styles.panel}>
        <Outlet />
      </section>
    </div>
  );
}