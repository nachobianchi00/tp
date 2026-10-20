import 'reflect-metadata'
import { orm } from '../shared/db/orm.js'
import { hashPassword } from '../shared/password.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { Admin } from '../admin/admin.entity.js'

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} must be set`)
  return value
}

try {
  const nombre = requiredEnv('INITIAL_ADMIN_NOMBRE')
  const apellido = requiredEnv('INITIAL_ADMIN_APELLIDO')
  const mail = requiredEnv('INITIAL_ADMIN_MAIL').toLowerCase()
  const password = requiredEnv('INITIAL_ADMIN_PASSWORD')
  const dni = Number(requiredEnv('INITIAL_ADMIN_DNI'))

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new Error('INITIAL_ADMIN_MAIL must be a valid email address')
  }
  if (!Number.isSafeInteger(dni) || dni <= 0) {
    throw new Error('INITIAL_ADMIN_DNI must be a positive integer')
  }
  if (await orm.em.count(Admin) > 0) {
    throw new Error('An admin already exists; this bootstrap can only create the first admin')
  }
  if (await orm.em.findOne(Cliente, { mail })) {
    throw new Error('An account with INITIAL_ADMIN_MAIL already exists')
  }

  const admin = orm.em.create(Admin, {
    nombre,
    apellido,
    dni,
    mail,
    password: await hashPassword(password),
  })
  await orm.em.flush()
  console.log(`Initial admin created with id ${admin.id}`)
} finally {
  await orm.close(true)
}
