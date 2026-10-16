// src/service/auth.service.ts
import { http, HttpError } from './http';
import type { AuthIdentity, LoginCredentials, RegisterClientData } from '../type/authType';

// Cada escritura (POST) pide un token CSRF nuevo y lo manda en el header.
const csrfHeader = async () => ({
  'X-CSRF-Token': (await http<{ csrfToken: string }>('/auth/csrf')).csrfToken,
});

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthIdentity> {
    const res = await http<{ data: AuthIdentity }>('/auth/login', {
      method: 'POST',
      headers: await csrfHeader(),
      body: JSON.stringify(credentials),
    });
    return res.data;
  },

  async registerCliente(data: RegisterClientData): Promise<void> {
    await http('/clientes', {
      method: 'POST',
      headers: await csrfHeader(),
      body: JSON.stringify(data),
    });
  },

  async me(): Promise<AuthIdentity | null> {
    try {
      return (await http<{ data: AuthIdentity }>('/auth/me')).data;
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return null; // no hay sesión
      throw e;
    }
  },

  async logout(): Promise<void> {
    await http('/auth/logout', { method: 'POST', headers: await csrfHeader() });
  },
};