import { http } from './http';

export interface AdminUser {
  id: number;
  nombre: string;
  apellido: string;
  dni: number;
  mail: string;
}

interface AdminInput {
  name: string;
  lastName: string;
  dni: number;
  email: string;
}

function serializeAdmin(admin: AdminInput, password?: string): string {
  return JSON.stringify({
    nombre: admin.name,
    apellido: admin.lastName,
    dni: admin.dni,
    mail: admin.email,
    password,
  });
}

export async function getAdmins(): Promise<AdminUser[]> {
  const { data } = await http<{ data: AdminUser[] }>('/admins');
  return data;
}

export async function createAdmin(admin: AdminInput, password: string): Promise<AdminUser> {
  const { data } = await http<{ data: AdminUser }>('/admins', {
    method: 'POST',
    body: serializeAdmin(admin, password),
  });
  return data;
}

export async function updateAdmin(
  id: number,
  admin: AdminInput,
  password?: string,
): Promise<AdminUser> {
  const { data } = await http<{ data: AdminUser }>(`/admins/${id}`, {
    method: 'PUT',
    body: serializeAdmin(admin, password),
  });
  return data;
}

export async function deleteAdmin(id: number): Promise<void> {
  await http(`/admins/${id}`, { method: 'DELETE' });
}