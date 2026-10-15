import { Router } from 'express'
import { createCsrfProtection } from '../shared/security/csrf.js'
import { authErrorHandler, csrf, login, logout, me } from './auth.controler.js'

/** La fábrica permite configurar orígenes y probar el router sin importar index.ts. */
export function createAuthRouter(opciones: { allowedOrigins: readonly string[] }): Router {
  const routerAutenticacion = Router()
  const protegerCsrf = createCsrfProtection(opciones)
  routerAutenticacion.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  routerAutenticacion.post('/login', protegerCsrf, login)
  routerAutenticacion.get('/me', me)
  routerAutenticacion.post('/logout', protegerCsrf, logout)
  routerAutenticacion.get('/csrf', csrf)
  routerAutenticacion.use(authErrorHandler)
  return routerAutenticacion
}
