export interface ClienteType {
  id: number;
  nombre: string;
  apellido: string;
  dni: number;
  direccion: string;
  telefono: string;
  mail: string;
  password: string;
}

export type ClientProfile = Omit<ClienteType, 'password'>;

export type ClientChanges = Partial<Omit<ClienteType, 'id'>>;

export interface AccountOutletContext {
  client: ClientProfile;
  reload: () => Promise<void>;
}