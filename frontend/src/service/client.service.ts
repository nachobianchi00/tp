import { http } from './http';
import { authService } from './auth.service';
import type { ClientChanges, ClientProfile } from '../type/clientType';

export async function getClient(id: number): Promise<ClientProfile> {
  const { data } = await http<{ data: ClientProfile }>(`/clientes/${id}`);
  const { nombre, apellido, dni, direccion, telefono, mail } = data;
  return { id: data.id, nombre, apellido, dni, direccion, telefono, mail };
}

export async function updateClient(id: number, changes: ClientChanges) {
  await http(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
}

export async function deleteClient(id: number) {
  await http(`/clientes/${id}`, { method: 'DELETE' });
}

export async function confirmPassword(mail: string, password: string) {
  await authService.login({ mail, password, tipo: 'cliente' });
}