import session from 'express-session'
import type { Request, RequestHandler, Response } from 'express'
import type {} from './session.types.js'

export const SESSION_COOKIE_NAME = 'minigo.sid'
export const SESSION_TTL_MS = 30 * 60 * 1000

/** Mismo nombre, Path y atributos que la cookie original; sin maxAge al eliminar. */
export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/api', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || req.secure,
  })
}

/** Lee la configuración al invocarse; no importa el ORM ni inicia un servidor. */
export function createSessionOptions(almacen?: session.Store): session.SessionOptions {
  const secreto = process.env.SESSION_SECRET
  if (!secreto || secreto.trim().length === 0 || Buffer.byteLength(secreto, 'utf8') < 32) {
    // La longitud es una comprobación mínima: el secreto real debe generarse aleatoriamente.
    throw new Error('SESSION_SECRET must contain at least 32 bytes')
  }

  const enProduccion = process.env.NODE_ENV === 'production'
  if (enProduccion && (!almacen || almacen instanceof session.MemoryStore)) {
    throw new Error('Production requires a suitable session store; MemoryStore is only for development and tests')
  }

  return {
    name: SESSION_COOKIE_NAME,
    secret: secreto,
    store: almacen,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: enProduccion ? true : 'auto',
      path: '/api',
      // getSessionIdentity() comprueba además el vencimiento absoluto desde el login.
      maxAge: SESSION_TTL_MS,
    },
  }
}

/** MemoryStore se usa por defecto solo fuera de producción. Antes del despliegue hay que elegir otro almacén. */
export function createSessionMiddleware(almacen?: session.Store): RequestHandler {
  return session(createSessionOptions(almacen))
}
