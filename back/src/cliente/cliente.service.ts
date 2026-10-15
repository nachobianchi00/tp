import { orm } from '../shared/db/orm.js'
import { ServiceError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js'
import { hashPassword } from '../shared/security/password.js'
import { requirePassword } from '../shared/security/password-validation.js'
import { Cliente } from './cliente.entity.js'
import { Pedido } from '../pedido/pedido.entity.js'
import { FlushMode, ForeignKeyConstraintViolationException, IsolationLevel, LockMode } from '@mikro-orm/core'

const em = orm.em

function parseCliente(value: unknown) {
  const body = requireRecord(value)
  const nombre = requireString(body.nombre, 'nombre')
  const apellido = requireString(body.apellido, 'apellido')
  const dni = requirePositiveInteger(body.dni, 'dni')
  const direccion = requireString(body.direccion, 'direccion')
  const telefono = requireString(body.telefono, 'telefono')
  const mail = requireString(body.mail, 'mail').toLowerCase()
  const password = requirePassword(body.password)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    throw new ServiceError('mail must be a valid email address', 400)
  }
  return { nombre, apellido, dni, direccion, telefono, mail, password }
}

function parseClienteUpdate(value: unknown) {
  const body = requireRecord(value)
  const allowedFields = ['nombre', 'apellido', 'dni', 'direccion', 'telefono', 'mail', 'password']
  if (Object.keys(body).some(field => !allowedFields.includes(field))) {
    throw new ServiceError('Request body contains fields that cannot be updated', 400)
  }

  const input: Partial<Pick<Cliente, 'nombre' | 'apellido' | 'dni' | 'direccion' | 'telefono' | 'mail' | 'password'>> = {}
  if (Object.hasOwn(body, 'nombre')) input.nombre = requireString(body.nombre, 'nombre')
  if (Object.hasOwn(body, 'apellido')) input.apellido = requireString(body.apellido, 'apellido')
  if (Object.hasOwn(body, 'dni')) input.dni = requirePositiveInteger(body.dni, 'dni')
  if (Object.hasOwn(body, 'direccion')) input.direccion = requireString(body.direccion, 'direccion')
  if (Object.hasOwn(body, 'telefono')) input.telefono = requireString(body.telefono, 'telefono')
  if (Object.hasOwn(body, 'mail')) {
    input.mail = requireString(body.mail, 'mail').toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.mail)) {
      throw new ServiceError('mail must be a valid email address', 400)
    }
  }
  if (Object.hasOwn(body, 'password')) input.password = requirePassword(body.password)
  return input
}

export async function findAllClientes() {
  return em.find(Cliente, {}, { populate: ['pedidos'] })
}

export async function findCliente(id: number) {
  const cliente = await em.findOne(Cliente, { id }, { populate: ['pedidos'] })
  if (!cliente) throw new ServiceError('Cliente not found', 404)
  return cliente
}

export async function createCliente(value: unknown) {
  const input = parseCliente(value)
  if (await em.findOne(Cliente, { mail: input.mail })) {
    throw new ServiceError('A client with this email already exists', 409)
  }
  if (await em.findOne(Cliente, { dni: input.dni })) {
    throw new ServiceError('A client with this DNI already exists', 409)
  }
  const cliente = em.create(Cliente, { ...input, password: await hashPassword(input.password) })
  await em.flush()
  return cliente
}

export async function updateCliente(id: number, value: unknown) {
  const cliente = await findCliente(id)
  const input = parseClienteUpdate(value)
  if (input.mail !== undefined && input.mail !== cliente.mail) {
    const duplicate = await em.findOne(Cliente, { mail: input.mail })
    if (duplicate && duplicate.id !== cliente.id) {
      throw new ServiceError('A client with this email already exists', 409)
    }
  }
  if (input.dni !== undefined && input.dni !== cliente.dni) {
    const duplicate = await em.findOne(Cliente, { dni: input.dni })
    if (duplicate && duplicate.id !== cliente.id) {
      throw new ServiceError('A client with this DNI already exists', 409)
    }
  }
  // Solo una contraseña enviada y validada reemplaza el valor anterior.
  if (input.password !== undefined) input.password = await hashPassword(input.password)
  em.assign(cliente, input)
  await em.flush()
  return cliente
}

export async function deleteCliente(id: number) {
  try {
    await em.transactional(async tx => {
      // El bloqueo de la cuenta se mantiene hasta el commit. La FK de Pedido
      // impide insertar un pedido para ese cliente mientras se completa el borrado.
      const cliente = await tx.findOne(Cliente, { id }, {
        lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true, populate: false,
        flushMode: FlushMode.COMMIT,
      })
      if (!cliente) throw new ServiceError('Cliente not found', 404)
      if (await tx.count(Pedido, { cliente: id }, { flushMode: FlushMode.COMMIT }) > 0) {
        throw new ServiceError('No podés eliminar tu cuenta porque tiene pedidos registrados', 409)
      }
      tx.remove(cliente)
      await tx.flush()
    }, { clear: true, flushMode: FlushMode.COMMIT, isolationLevel: IsolationLevel.READ_COMMITTED })
  } catch (error) {
    // Una restricción referencial también se traduce a un conflicto de negocio.
    if (error instanceof ForeignKeyConstraintViolationException) {
      throw new ServiceError('No podés eliminar tu cuenta porque tiene registros asociados', 409)
    }
    throw error
  }
}
