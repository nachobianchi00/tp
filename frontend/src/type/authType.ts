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

export interface RegisterClientData {
  nombre: string;
  apellido: string;
  dni: number;
  direccion: string;
  telefono: string;
  mail: string;
  password: string;
}