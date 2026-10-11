import type { AuthIdentity } from '../../auth/auth.service.js'

declare module 'express-session' {
  interface SessionData {
    identity?: AuthIdentity
    /** Instante de login en milisegundos; fija el vencimiento absoluto del servidor. */
    authenticatedAt?: number
    /** Se pierde al regenerar la sesión: el siguiente getCsrfToken() entrega un valor nuevo. */
    csrf?: {
      token: string
      sessionId: string
      expiresAt: number
    }
  }
}
