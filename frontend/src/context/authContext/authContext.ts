import { createContext } from 'react';
import type { AuthIdentity, LoginCredentials } from '../../type/authType';

export interface AuthContextType {
  identity: AuthIdentity | null;
  checking: boolean;
  submitting: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);