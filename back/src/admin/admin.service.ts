import { orm } from '../shared/db/orm.js'
import { AppError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/password.js'
import { Admin } from './admin.entity.js'

const em = orm.em

function parseAdmin(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const mail = requireString(body.mail, 'mail').toLowerCase()
  const password = requireString(body.password, 'password')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new AppError('mail must be a valid email address', 400)
  }
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
  const body = requireRecord(value)
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
