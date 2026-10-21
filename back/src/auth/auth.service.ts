import { randomBytes } from 'node:crypto'
import { Admin } from '../admin/admin.entity.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { orm } from '../shared/db/orm.js'
import { ServiceError, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword, verifyPassword } from '../shared/security/password.js'
import { requirePassword } from '../shared/security/password-validation.js'

export type AccountType = 'cliente' | 'admin'

export interface AuthIdentity {
  id: number
  tipo: AccountType
}

const em = orm.em
let hashFicticio: Promise<string> | undefined

function validarCredenciales(valor: unknown): { tipo: AccountType; mail: string; password: string } {
  const datos = requireRecord(valor)
  const tipo = datos.tipo
  if (tipo !== 'cliente' && tipo !== 'admin') {
    throw new ServiceError('tipo must be cliente or admin', 400)
  }
  const correo = requireString(datos.mail, 'mail').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new ServiceError('mail must be a valid email address', 400)
  }
  const contrasena = requirePassword(datos.password)
  return { tipo, mail: correo, password: contrasena }
}

async function coincideContrasena(hashGuardado: string | undefined, contrasena: string): Promise<boolean> {
  if (hashGuardado !== undefined) {
    try {
      return await verifyPassword(hashGuardado, contrasena)
    } catch {
      // Un hash inválido, incluido texto plano, nunca habilita una comparación alternativa.
    }
  }

  // Incluso sin cuenta válida se realiza trabajo Argon2 con un hash ficticio reutilizable.
  try {
    hashFicticio ??= hashPassword(randomBytes(32).toString('hex'))
    await verifyPassword(await hashFicticio, contrasena)
  } catch {
    // Si falla la biblioteca tampoco se concede acceso.
  }
  return false
}

/** Verifica credenciales sin crear sesiones ni modificar la cuenta. */
export async function verifyCredentials(valor: unknown): Promise<AuthIdentity> {
  const { tipo, mail: correo, password: contrasena } = validarCredenciales(valor)
  let cuenta: Cliente | Admin | null
  try {
    cuenta = tipo === 'cliente'
      ? await em.findOne(Cliente, { mail: correo })
      : await em.findOne(Admin, { mail: correo })
  } catch {
    // Los fallos de almacenamiento son errores del sistema; no se exponen detalles internos.
    throw new ServiceError('No se pudieron verificar las credenciales', 500)
  }

  const contrasenaCorrecta = await coincideContrasena(cuenta?.password, contrasena)
  if (!cuenta || !contrasenaCorrecta || !Number.isSafeInteger(cuenta.id) || cuenta.id === undefined || cuenta.id <= 0) {
    throw new ServiceError('Credenciales inválidas', 401)
  }

  // La identidad se construye desde la cuenta verificada, nunca desde un ID enviado por el usuario.
  return { id: cuenta.id, tipo }
}
