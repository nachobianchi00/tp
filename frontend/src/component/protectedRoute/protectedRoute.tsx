import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/authContext/useAuth';

interface Props {
  tipo?: 'cliente' | 'admin'; // si se indica, solo deja pasar a ese tipo de usuario
}

export default function ProtectedRoute({ tipo }: Props) {
  const { identity, checking } = useAuth();
  const location = useLocation();

  // Al recargar, el provider todavía está preguntando al back si hay sesión.
  if (checking) return <p>Cargando…</p>;

  // Sin sesión: al login que corresponda, recordando adónde iba
  if (!identity) {
    const login = tipo === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={login} state={{ from: location }} replace />;
  }

  // Con sesión, pero de otro tipo (por ejemplo, un admin entrando al checkout)
  if (tipo && identity.tipo !== tipo) return <Navigate to="/" replace />;

  return <Outlet />;
}