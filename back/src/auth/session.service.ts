import type { Request } from 'express'
import { verifyCredentials } from './auth.service.js'
import type { AuthIdentity } from './auth.service.js'
import { ServiceError } from '../shared/service-errors.js'
import { SESSION_TTL_MS } from '../shared/security/session.js'
import type {} from '../shared/security/session.types.js'
import { orm } from '../shared/db/orm.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { Admin } from '../admin/admin.entity.js'

type SessionRequest = Pick<Request, 'session'>
type RequestSession = Request['session']
type SessionOperation = 'regenerate' | 'save' | 'destroy'

// express-session usa callbacks. La promesa permite esperar y capturar también errores síncronos.
function runOperation(session: RequestSession, operation: SessionOperation): Promise<void> {
  return new Promise((resolve, reject) => {
    session[operation](error => error ? reject(error) : resolve())
  })
}

function removeIdentity(session: RequestSession): void {
  delete session.identity
  delete session.authenticatedAt
}

async function discardFailedSession(request: SessionRequest): Promise<void> {
  if (!request.session) return
  try {
    await destroySession(request)
  } catch {
    // Se conserva el error principal; nunca se informa que el login fue exitoso.
    // Si el almacén falla, no podemos garantizar la eliminación de su registro.
  }
}

/** Verifica credenciales antes de regenerar el ID y guardar únicamente una identidad segura. */
export async function createSession(request: SessionRequest, credentials: unknown): Promise<AuthIdentity> {
  if (!request.session) {
    throw new ServiceError('No se pudo iniciar la sesión', 500)
  }

  // Un intento con credenciales incorrectas no modifica una sesión existente.
  const identity = await verifyCredentials(credentials)
  const previousSession = request.session
  try {
    await runOperation(previousSession, 'regenerate')
  } catch {
    // El almacén puede haber creado una nueva sesión incluso al devolver un error.
    removeIdentity(previousSession)
    await discardFailedSession(request)
    throw new ServiceError('No se pudo iniciar la sesión', 500)
  }

  try {
    request.session.identity = { id: identity.id, tipo: identity.tipo }
    // Se fija después de verificar credenciales y regenerar; las consultas no lo renuevan.
    request.session.authenticatedAt = Date.now()
    request.session.cookie.maxAge = SESSION_TTL_MS
    await runOperation(request.session, 'save')
  } catch {
    await discardFailedSession(request)
    throw new ServiceError('No se pudo guardar la sesión', 500)
  }

  // Copia independiente: modificar el resultado no modifica la identidad almacenada.
  return { id: identity.id, tipo: identity.tipo }
}

/** Devuelve null sin autenticación; una sesión vencida o inconsistente se elimina. */
export async function getSessionIdentity(request: SessionRequest): Promise<AuthIdentity | null> {
  const current = request.session
  if (!current) return null
  const { identity, authenticatedAt } = current
  if (identity === undefined && authenticatedAt === undefined) return null

  const now = Date.now()
  const validIdentity = identity !== null && typeof identity === 'object'
    && Number.isSafeInteger(identity.id) && identity.id > 0
    && (identity.tipo === 'cliente' || identity.tipo === 'admin')
  const validStart = typeof authenticatedAt === 'number' && Number.isSafeInteger(authenticatedAt)
    && authenticatedAt > 0 && authenticatedAt <= now

  if (!validIdentity || !validStart || now - authenticatedAt >= SESSION_TTL_MS) {
    await destroySession(request)
    return null
  }

  let cuentaExiste: boolean
  try {
    // count consulta el almacenamiento: no reutiliza una entidad de la identity map.
    cuentaExiste = (identity.tipo === 'cliente'
      ? await orm.em.count(Cliente, { id: identity.id })
      : await orm.em.count(Admin, { id: identity.id })) > 0
  } catch {
    // Sin una comprobación vigente no se concede acceso ni se supone un logout exitoso.
    throw new ServiceError('No se pudo verificar la cuenta de la sesión', 500)
  }
  if (!cuentaExiste) {
    await destroySession(request)
    return null
  }

  return { id: identity.id, tipo: identity.tipo }
}

/** Elimina el registro del almacén; borrar la cookie será responsabilidad del futuro controlador. */
export async function destroySession(request: SessionRequest): Promise<void> {
  const current = request.session
  if (!current) return
  removeIdentity(current)
  try {
    await runOperation(current, 'destroy')
  } catch {
    throw new ServiceError('No se pudo cerrar la sesión', 500)
  }
}
