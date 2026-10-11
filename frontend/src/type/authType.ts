export type AccountType = 'cliente' | 'admin';

export interface AuthIdentity {
  id: number;
  tipo: AccountType;
}

export interface LoginCredentials {
  mail: string;
  password: string;
  tipo: AccountType;
}
