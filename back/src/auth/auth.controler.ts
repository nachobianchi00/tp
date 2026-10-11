import type { ErrorRequestHandler, Request, Response } from 'express'
import { ServiceError, isRecord } from '../shared/service-errors.js'
import { getCsrfToken } from '../shared/security/csrf.js'
import { SESSION_COOKIE_NAME } from '../shared/security/session.js'
import { createSession, destroySession, getSessionIdentity } from './session.service.js'

function clearSessionCookie(req: Request, res: Response): void {
  // Mismo nombre y Path que la configuración de sesiones; sin maxAge al borrar.
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/api', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || req.secure,
  })
}

export async function login(req: Request, res: Response): Promise<void> {
  let created = false
  try {
    const identity = await createSession(req, req.body)
    created = true
    // regenerate() quitó el token anónimo. Se guarda uno nuevo antes de responder.
    const csrfToken = await getCsrfToken(req)
    res.json({ message: 'Sesión iniciada', data: identity, csrfToken })
  } catch (error) {
    if (created) {
      try {
        await destroySession(req)
      } catch {
        // Un fallo del almacén no garantiza revocación; se responde error, nunca éxito.
      }
      clearSessionCookie(req, res)
    } else if (!req.session) {
      clearSessionCookie(req, res)
    }
    // Express 5 entrega el rechazo al manejador de errores de autenticación.
    throw error
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  const identity = await getSessionIdentity(req)
  if (!identity) {
    // Conserva la cookie de una sesión anónima; elimina la de una sesión destruida por vencimiento.
    if (!req.session) clearSessionCookie(req, res)
    throw new ServiceError('No autenticado', 401)
  }
  res.json({ data: identity })
}

export async function logout(req: Request, res: Response): Promise<void> {
  await destroySession(req)
  clearSessionCookie(req, res)
  res.json({ message: 'Sesión cerrada' })
}

export async function csrf(req: Request, res: Response): Promise<void> {
  res.json({ csrfToken: await getCsrfToken(req) })
}

/** Solo para /api/auth: no cambia el tratamiento de errores de los CRUD existentes. */
export const authErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error)
  res.set('Cache-Control', 'no-store')
  if (error instanceof ServiceError && [400, 401, 403].includes(error.statusCode)) {
    res.status(error.statusCode).json({ message: error.message })
    return
  }
  // Errores del parser JSON anterior al router también deben salir como JSON sin detalles internos.
  const parseErrors: Record<string, { status: number; message: string }> = {
    'entity.parse.failed': { status: 400, message: 'JSON inválido' },
    'entity.too.large': { status: 413, message: 'Solicitud demasiado grande' },
    'charset.unsupported': { status: 415, message: 'Codificación no admitida' },
    'encoding.unsupported': { status: 415, message: 'Codificación no admitida' },
  }
  const parserError = isRecord(error) && typeof error.type === 'string'
    && Object.hasOwn(parseErrors, error.type) ? parseErrors[error.type] : undefined
  if (parserError) {
    res.status(parserError.status).json({ message: parserError.message })
    return
  }
  res.status(500).json({ message: 'No se pudo completar la autenticación' })
}
