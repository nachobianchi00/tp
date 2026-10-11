import { argon2id, hash, verify } from 'argon2'

/** Genera un hash Argon2id con un salt aleatorio y los costos predeterminados de la biblioteca. */
export async function hashPassword(password: string): Promise<string> {
  // La contraseña se conserva tal como llega, incluidos espacios y caracteres Unicode.
  return hash(password, { type: argon2id })
}

/**
 * Verifica la contraseña contra el hash almacenado.
 * Devuelve false si no coincide; un hash inválido o un fallo de la biblioteca rechaza la promesa.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  return verify(storedHash, password)
}
