import { http, HttpError } from './http'
import type { AuthIdentity, LoginCredentials, RegisterClientData } from '../type/authType'

type IdentityResponse = { data: AuthIdentity }

export const authService = {
  async login(c: LoginCredentials) {
    const r = await http<IdentityResponse>('/auth/login', { method: 'POST', body: JSON.stringify(c) })
    return r.data
  },
  async registerCliente(c: RegisterClientData) {
    const { nombre, apellido, dni, direccion, telefono, mail, password } = c
    await http('/clientes', {
      method: 'POST',
      body: JSON.stringify({ nombre, apellido, dni, direccion, telefono, mail, password }),
    })
  },
  async me() {
    try {
      return (await http<IdentityResponse>('/auth/me')).data
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return null
      throw e
    }
  },
  async logout() {
    await http('/auth/logout', { method: 'POST' })
  },
}