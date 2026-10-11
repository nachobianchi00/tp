import { Router } from 'express'
import { createCsrfProtection } from '../shared/security/csrf.js'
import { authErrorHandler, csrf, login, logout, me } from './auth.controler.js'

/** La fábrica permite configurar orígenes y probar el router sin importar index.ts. */
export function createAuthRouter(options: { allowedOrigins: readonly string[] }): Router {
  const authRouter = Router()
  const protectCsrf = createCsrfProtection(options)
  authRouter.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  authRouter.post('/login', protectCsrf, login)
  authRouter.get('/me', me)
  authRouter.post('/logout', protectCsrf, logout)
  authRouter.get('/csrf', csrf)
  authRouter.use(authErrorHandler)
  return authRouter
}
