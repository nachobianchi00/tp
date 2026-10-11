import { ServiceError } from '../service-errors.js'

/** Valida la contraseña sin modificar los caracteres que se usarán para generar el hash. */
export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ServiceError('password must be a non-empty string', 400)
  }
  // trim() solo comprueba si hay contenido; nunca se devuelve la versión recortada.
  return value
}
