import { orm } from '../shared/db/orm.js'
import { AppError, requireAllowedFields, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/password.js'
import { Admin } from './admin.entity.js'
import { Cliente } from '../cliente/cliente.entity.js'

const em = orm.em

function normalizedMail(value: unknown) {
  const mail = requireString(value, 'mail').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new AppError('mail must be a valid email address', 400)
  }
  return mail
}

function parseAdmin(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const mail = normalizedMail(body.mail)
  const password = requireString(body.password, 'password')
  return { nombre, apellido, dni, mail, password }
}

export async function findAllAdmins() {
  return em.find(Admin, {})
}

export async function findAdmin(id: number) {
  const admin = await em.findOne(Admin, { id })
  if (!admin) throw new AppError('Admin not found', 404)
  return admin
}

export async function createAdmin(value: unknown) {
  const input = parseAdmin(value)
  if (await em.findOne(Admin, { mail: input.mail })) {
    throw new AppError('An admin with this email already exists', 409)
  }
  if (await em.findOne(Cliente, { mail: input.mail })) {
    throw new AppError('An account with this email already exists', 409)
  }
  if (await em.findOne(Admin, { dni: input.dni })) {
    throw new AppError('An admin with this DNI already exists', 409)
  }
  const admin = em.create(Admin, {
    ...input,
    password: await hashPassword(input.password),
  })
  await em.flush()
  return admin
}

export async function updateAdmin(id: number, value: unknown) {
  const admin = await findAdmin(id)
  const body = requireAllowedFields(value, ['nombre', 'apellido', 'dni', 'mail', 'password'])
  if ('nombre' in body) body.nombre = requireString(body.nombre, 'nombre')
  if ('apellido' in body) body.apellido = requireString(body.apellido, 'apellido')
  if ('dni' in body) {
    const dni = requirePositiveInteger(body.dni, 'dni')
    body.dni = dni
    if (await em.findOne(Admin, { dni, id: { $ne: id } })) {
      throw new AppError('An admin with this DNI already exists', 409)
    }
  }
  if ('mail' in body) {
    const mail = normalizedMail(body.mail)
    const [existingAdmin, existingCliente] = await Promise.all([
      em.findOne(Admin, { mail }),
      em.findOne(Cliente, { mail }),
    ])
    if (existingAdmin && existingAdmin.id !== id) {
      throw new AppError('An admin with this email already exists', 409)
    }
    if (existingCliente) throw new AppError('An account with this email already exists', 409)
    body.mail = mail
  }
  if ('password' in body) {
    body.password = await hashPassword(requireString(body.password, 'password'))
  }
  em.assign(admin, body)
  await em.flush()
  return admin
}

export async function deleteAdmin(id: number) {
  const admin = await findAdmin(id)
  em.remove(admin)
  await em.flush()
}
