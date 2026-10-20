import { orm } from '../shared/db/orm.js'
import { AppError, requireAllowedFields, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/password.js'
import { Cliente } from './cliente.entity.js'
import { Admin } from '../admin/admin.entity.js'

const em = orm.em

function normalizedMail(value: unknown) {
  const mail = requireString(value, 'mail').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new AppError('mail must be a valid email address', 400)
  }
  return mail
}

function parseCliente(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const direccion = requireString(body.direccion, 'direccion')
  const telefono = requireString(body.telefono, 'telefono')
  const mail = normalizedMail(body.mail)
  const password = requireString(body.password, 'password')
  return { nombre, apellido, dni, direccion, telefono, mail, password }
}

export async function findAllClientes() {
  return em.find(Cliente, {}, { populate: ['pedidos'] })
}

export async function findCliente(id: number) {
  const cliente = await em.findOne(Cliente, { id }, { populate: ['pedidos'] })
  if (!cliente) throw new AppError('Cliente not found', 404)
  return cliente
}

export async function createCliente(value: unknown) {
  const input = parseCliente(value)
  if (await em.findOne(Cliente, { mail: input.mail })) {
    throw new AppError('A client with this email already exists', 409)
  }
  if (await em.findOne(Admin, { mail: input.mail })) {
    throw new AppError('An account with this email already exists', 409)
  }
  if (await em.findOne(Cliente, { dni: input.dni })) {
    throw new AppError('A client with this DNI already exists', 409)
  }
  const cliente = em.create(Cliente, {
    ...input,
    password: await hashPassword(input.password),
  })
  await em.flush()
  return cliente
}


export async function updateCliente(id: number, value: unknown) {
  const cliente = await findCliente(id)
  const body = requireAllowedFields(value, [
    'nombre', 'apellido', 'dni', 'direccion', 'telefono', 'mail', 'password',
  ])
  if ('nombre' in body) body.nombre = requireString(body.nombre, 'nombre')
  if ('apellido' in body) body.apellido = requireString(body.apellido, 'apellido')
  if ('dni' in body) {
    const dni = requirePositiveInteger(body.dni, 'dni')
    body.dni = dni
    if (await em.findOne(Cliente, { dni, id: { $ne: id } })) {
      throw new AppError('A client with this DNI already exists', 409)
    }
  }
  if ('direccion' in body) body.direccion = requireString(body.direccion, 'direccion')
  if ('telefono' in body) body.telefono = requireString(body.telefono, 'telefono')
  if ('mail' in body) {
    const mail = normalizedMail(body.mail)
    const [existingCliente, existingAdmin] = await Promise.all([
      em.findOne(Cliente, { mail }),
      em.findOne(Admin, { mail }),
    ])
    if (existingCliente && existingCliente.id !== id) {
      throw new AppError('A client with this email already exists', 409)
    }
    if (existingAdmin) throw new AppError('An account with this email already exists', 409)
    body.mail = mail
  }
  if ('password' in body) {
    body.password = await hashPassword(requireString(body.password, 'password'))
  }
  em.assign(cliente, body)
  await em.flush()
  return cliente
}

export async function deleteCliente(id: number) {
  const cliente = await findCliente(id)
  em.remove(cliente)
  await em.flush()
}
