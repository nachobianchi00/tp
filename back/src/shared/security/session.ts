import session from 'express-session'
import type { RequestHandler } from 'express'
import type {} from './session.types.js'

export const SESSION_COOKIE_NAME = 'minigo.sid'
export const SESSION_TTL_MS = 30 * 60 * 1000

/** Lee la configuración al invocarse; no importa el ORM ni inicia un servidor. */
export function createSessionOptions(store?: session.Store): session.SessionOptions {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.trim().length === 0 || Buffer.byteLength(secret, 'utf8') < 32) {
    // La longitud es una comprobación mínima: el secreto real debe generarse aleatoriamente.
    throw new Error('SESSION_SECRET must contain at least 32 bytes')
  }

  const production = process.env.NODE_ENV === 'production'
  if (production && (!store || store instanceof session.MemoryStore)) {
    throw new Error('Production requires a suitable session store; MemoryStore is only for development and tests')
  }

  return {
    name: SESSION_COOKIE_NAME,
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: production ? true : 'auto',
      path: '/api',
      // Duración inicial: la actividad puede renovarla. El límite absoluto se abordará en 3.2.b.
      maxAge: SESSION_TTL_MS,
    },
  }
}

/** MemoryStore se usa por defecto solo fuera de producción. Antes del despliegue hay que elegir otro almacén. */
export function createSessionMiddleware(store?: session.Store): RequestHandler {
  return session(createSessionOptions(store))
}
