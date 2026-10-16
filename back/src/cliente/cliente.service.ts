import { orm } from '../shared/db/orm.js'
import { AppError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/password.js'
import { Cliente } from './cliente.entity.js'

const em = orm.em

function parseCliente(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const direccion = requireString(body.direccion, 'direccion')
  const telefono = requireString(body.telefono, 'telefono')
  const mail = requireString(body.mail, 'mail').toLowerCase()
  const password = requireString(body.password, 'password')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new AppError('mail must be a valid email address', 400)
  }
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
  const body = requireRecord(value)
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
