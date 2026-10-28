import { Outlet } from 'react-router-dom';
import styles from './adminLayout.module.css';

export default function AdminLayout() {
  return (
    <div className={styles.layout}>
      <Outlet />
    </div>
  );
}