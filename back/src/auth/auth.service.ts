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
let dummyHash: Promise<string> | undefined

function parseCredentials(value: unknown): { tipo: AccountType; mail: string; password: string } {
  const body = requireRecord(value)
  const tipo = body.tipo
  if (tipo !== 'cliente' && tipo !== 'admin') {
    throw new ServiceError('tipo must be cliente or admin', 400)
  }
  const mail = requireString(body.mail, 'mail').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new ServiceError('mail must be a valid email address', 400)
  }
  const password = requirePassword(body.password)
  return { tipo, mail, password }
}

async function passwordMatches(storedHash: string | undefined, password: string): Promise<boolean> {
  if (storedHash !== undefined) {
    try {
      return await verifyPassword(storedHash, password)
    } catch {
      // Un hash inválido, incluido texto plano, nunca habilita una comparación alternativa.
    }
  }

  // Sin cuenta o con un hash inválido también se realiza trabajo Argon2.
  // Este hash ficticio se genera una sola vez y no representa ninguna cuenta.
  try {
    dummyHash ??= hashPassword(randomBytes(32).toString('hex'))
    await verifyPassword(await dummyHash, password)
  } catch {
    // Si falla la biblioteca tampoco se concede acceso.
  }
  return false
}

/** Verifica credenciales sin crear sesiones ni modificar la cuenta. */
export async function verifyCredentials(value: unknown): Promise<AuthIdentity> {
  const { tipo, mail, password } = parseCredentials(value)
  let account: Cliente | Admin | null
  try {
    account = tipo === 'cliente'
      ? await em.findOne(Cliente, { mail })
      : await em.findOne(Admin, { mail })
  } catch {
    // Los fallos de almacenamiento son errores del sistema; no se exponen detalles internos.
    throw new ServiceError('No se pudieron verificar las credenciales', 500)
  }

  const matches = await passwordMatches(account?.password, password)
  if (!account || !matches || !Number.isSafeInteger(account.id) || account.id === undefined || account.id <= 0) {
    throw new ServiceError('Credenciales inválidas', 401)
  }

  // La identidad se construye desde la cuenta verificada, nunca desde un ID enviado por el usuario.
  return { id: account.id, tipo }
}
