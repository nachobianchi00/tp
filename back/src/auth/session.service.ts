import type { Request } from 'express'
import { verifyCredentials } from './auth.service.js'
import type { AuthIdentity } from './auth.service.js'
import { ServiceError } from '../shared/service-errors.js'
import { SESSION_TTL_MS } from '../shared/security/session.js'
import type {} from '../shared/security/session.types.js'
import { orm } from '../shared/db/orm.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { Admin } from '../admin/admin.entity.js'

type SolicitudConSesion = Pick<Request, 'session'>
type SesionDeSolicitud = Request['session']
type OperacionDeSesion = 'regenerate' | 'save' | 'destroy'

// express-session usa callbacks. La promesa permite esperar y capturar también errores síncronos.
function ejecutarOperacion(sesion: SesionDeSolicitud, operacion: OperacionDeSesion): Promise<void> {
  return new Promise((resolve, reject) => {
    sesion[operacion](error => error ? reject(error) : resolve())
  })
}

function quitarIdentidad(sesion: SesionDeSolicitud): void {
  delete sesion.identity
  delete sesion.authenticatedAt
}

async function descartarSesionFallida(solicitud: SolicitudConSesion): Promise<void> {
  if (!solicitud.session) return
  try {
    await destroySession(solicitud)
  } catch {
    // Se conserva el error principal; nunca se informa que el login fue exitoso.
    // Si el almacén falla, no podemos garantizar la eliminación de su registro.
  }
}

/** Verifica credenciales antes de regenerar el ID y guardar únicamente una identidad segura. */
export async function createSession(solicitud: SolicitudConSesion, credenciales: unknown): Promise<AuthIdentity> {
  if (!solicitud.session) {
    throw new ServiceError('No se pudo iniciar la sesión', 500)
  }

  // Un intento con credenciales incorrectas no modifica una sesión existente.
  const identidad = await verifyCredentials(credenciales)
  const sesionAnterior = solicitud.session
  try {
    await ejecutarOperacion(sesionAnterior, 'regenerate')
  } catch {
    // El almacén puede haber creado una nueva sesión incluso al devolver un error.
    quitarIdentidad(sesionAnterior)
    await descartarSesionFallida(solicitud)
    throw new ServiceError('No se pudo iniciar la sesión', 500)
  }

  try {
    solicitud.session.identity = { id: identidad.id, tipo: identidad.tipo }
    // Se fija después de verificar credenciales y regenerar; las consultas no lo renuevan.
    solicitud.session.authenticatedAt = Date.now()
    solicitud.session.cookie.maxAge = SESSION_TTL_MS
    await ejecutarOperacion(solicitud.session, 'save')
  } catch {
    await descartarSesionFallida(solicitud)
    throw new ServiceError('No se pudo guardar la sesión', 500)
  }

  // Copia independiente: modificar el resultado no modifica la identidad almacenada.
  return { id: identidad.id, tipo: identidad.tipo }
}

/** Devuelve null sin autenticación; una sesión vencida o inconsistente se elimina. */
export async function getSessionIdentity(solicitud: SolicitudConSesion): Promise<AuthIdentity | null> {
  const sesionActual = solicitud.session
  if (!sesionActual) return null
  const { identity: identidad, authenticatedAt: inicioAutenticacion } = sesionActual
  if (identidad === undefined && inicioAutenticacion === undefined) return null

  const ahora = Date.now()
  const identidadValida = identidad !== null && typeof identidad === 'object'
    && Number.isSafeInteger(identidad.id) && identidad.id > 0
    && (identidad.tipo === 'cliente' || identidad.tipo === 'admin')
  const inicioValido = typeof inicioAutenticacion === 'number' && Number.isSafeInteger(inicioAutenticacion)
    && inicioAutenticacion > 0 && inicioAutenticacion <= ahora

  if (!identidadValida || !inicioValido || ahora - inicioAutenticacion >= SESSION_TTL_MS) {
    await destroySession(solicitud)
    return null
  }

  let cuentaExiste: boolean
  try {
    // count consulta el almacenamiento: no reutiliza una entidad de la identity map.
    cuentaExiste = (identidad.tipo === 'cliente'
      ? await orm.em.count(Cliente, { id: identidad.id })
      : await orm.em.count(Admin, { id: identidad.id })) > 0
  } catch {
    // Sin una comprobación vigente no se concede acceso ni se supone un logout exitoso.
    throw new ServiceError('No se pudo verificar la cuenta de la sesión', 500)
  }
  if (!cuentaExiste) {
    await destroySession(solicitud)
    return null
  }

  return { id: identidad.id, tipo: identidad.tipo }
}

/** Elimina la sesión del almacén; el controlador se encarga de borrar la cookie. */
export async function destroySession(solicitud: SolicitudConSesion): Promise<void> {
  const sesionActual = solicitud.session
  if (!sesionActual) return
  quitarIdentidad(sesionActual)
  try {
    await ejecutarOperacion(sesionActual, 'destroy')
  } catch {
    throw new ServiceError('No se pudo cerrar la sesión', 500)
  }
}
