import type { Request, RequestHandler } from 'express'
import { createCsrfProtection, getCsrfToken, validateCsrfToken, validateRequestOrigin } from '../src/shared/security/csrf.js'

// Solo comprobación de tipos: este ejemplo no se ejecuta ni registra middleware.
async function checkCsrf(request: Request) {
  const token: string = await getCsrfToken(request)
  validateCsrfToken(request, token)
  validateRequestOrigin(request, ['https://minigo.example'])
  const protection: RequestHandler = createCsrfProtection({ allowedOrigins: ['https://minigo.example'] })
  request.session.csrf = { token, sessionId: request.sessionID, expiresAt: Date.now() + 1000 }
  // @ts-expect-error El vencimiento se almacena como número.
  request.session.csrf = { token, sessionId: request.sessionID, expiresAt: 'mañana' }
  // @ts-expect-error Se exige una lista explícita de orígenes permitidos.
  createCsrfProtection({})
  return { token, protection }
}
