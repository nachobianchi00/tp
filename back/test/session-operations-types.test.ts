import type { Request } from 'express'
import type { AuthIdentity } from '../src/auth/auth.service.js'
import { createSession, getSessionIdentity, destroySession } from '../src/auth/session.service.js'

// Solo se comprueba con TypeScript: no se ejecutan estos ejemplos ni se carga el ORM.
async function checkOperations(request: Request) {
  const identity: AuthIdentity = await createSession(request, {
    tipo: 'cliente', mail: 'ficticio@example.com', password: 'contraseña ficticia',
  })
  const current: AuthIdentity | null = await getSessionIdentity(request)
  const result: void = await destroySession(request)
  request.session.authenticatedAt = Date.now()
  // @ts-expect-error La fecha de autenticación es un número, no una fecha enviada como texto.
  request.session.authenticatedAt = '2026-10-10'
  return { identity, current, result }
}
