import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/authContext/useAuth';
import type { AccountType } from '../../type/authType';

interface PropiedadesProtectedRoute {
  children: ReactNode;
  rolesPermitidos?: AccountType[];
  permitirInvitados?: boolean;
}

export default function ProtectedRoute({ children, rolesPermitidos, permitirInvitados = false }: PropiedadesProtectedRoute) {
  const { identity, checking } = useAuth();

  if (checking) {
    return <p>Comprobando sesión...</p>;
  }

  if (!identity) {
    return permitirInvitados ? children : <Navigate to="/login" replace />;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(identity.tipo)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
