import { orm } from '../shared/db/orm.js'
import { ServiceError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/security/password.js'
import { requirePassword } from '../shared/security/password-validation.js'
import { Admin } from './admin.entity.js'

const em = orm.em

function parseAdmin(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const mail = requireString(body.mail, 'mail').toLowerCase()
  const password = requirePassword(body.password)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new ServiceError('mail must be a valid email address', 400)
  }
  return { nombre, apellido, dni, mail, password }
}

function parseAdminUpdate(value: unknown) {
  const body = requireRecord(value)
  const allowedFields = ['nombre', 'apellido', 'dni', 'mail', 'password']
  if (Object.keys(body).some(field => !allowedFields.includes(field))) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }

  const input: Partial<Pick<Admin, 'nombre' | 'apellido' | 'dni' | 'mail' | 'password'>> = {}
  if (Object.hasOwn(body, 'nombre')) input.nombre = requireString(body.nombre, 'nombre')
  if (Object.hasOwn(body, 'apellido')) input.apellido = requireString(body.apellido, 'apellido')
  if (Object.hasOwn(body, 'dni')) input.dni = requirePositiveInteger(body.dni, 'dni')
  if (Object.hasOwn(body, 'mail')) {
    input.mail = requireString(body.mail, 'mail').toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.mail)) {
      throw new ServiceError('mail must be a valid email address', 400)
    }
  }
  if (Object.hasOwn(body, 'password')) input.password = requirePassword(body.password)
  return input
}

export async function findAllAdmins() {
  return em.find(Admin, {})
}

export async function findAdmin(id: number) {
  const admin = await em.findOne(Admin, { id })
  if (!admin) throw new ServiceError('Admin not found', 404)
  return admin
}

export async function createAdmin(value: unknown) {
  const input = parseAdmin(value)
  if (await em.findOne(Admin, { mail: input.mail })) {
    throw new ServiceError('An admin with this email already exists', 409)
  }
  if (await em.findOne(Admin, { dni: input.dni })) {
    throw new ServiceError('An admin with this DNI already exists', 409)
  }
  const admin = em.create(Admin, { ...input, password: await hashPassword(input.password) })
  await em.flush()
  return admin
}

export async function updateAdmin(id: number, value: unknown) {
  const admin = await findAdmin(id)
  const input = parseAdminUpdate(value)
  if (input.mail !== undefined && input.mail !== admin.mail) {
    const duplicate = await em.findOne(Admin, { mail: input.mail })
    if (duplicate && duplicate.id !== admin.id) {
      throw new ServiceError('An admin with this email already exists', 409)
    }
  }
  if (input.dni !== undefined && input.dni !== admin.dni) {
    const duplicate = await em.findOne(Admin, { dni: input.dni })
    if (duplicate && duplicate.id !== admin.id) {
      throw new ServiceError('An admin with this DNI already exists', 409)
    }
  }
  // Solo una contraseña enviada y validada reemplaza el valor anterior.
  if (input.password !== undefined) input.password = await hashPassword(input.password)
  em.assign(admin, input)
  await em.flush()
  return admin
}

export async function deleteAdmin(id: number) {
  const admin = await findAdmin(id)
  em.remove(admin)
  await em.flush()
}
