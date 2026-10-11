import type { RequestHandler, Response } from 'express'
import type { AuthIdentity } from '../src/auth/auth.service.js'
import {
  requireAuthentication, requireAccountType, requireAccountOwner,
} from '../src/shared/security/authorization.js'

// Solo se comprueba con TypeScript; no se ejecuta ni se carga el ORM.
function checkAuthorization(response: Response) {
  const middleware: RequestHandler[] = [
    requireAuthentication, requireAccountType('admin'), requireAccountType('cliente', 'admin'),
    requireAccountOwner('cliente'), requireAccountOwner('admin', 'accountId'),
  ]
  const identity: AuthIdentity | undefined = response.locals.identity
  // @ts-expect-error Una ruta pública puede no haber comprobado la identidad.
  const unchecked: AuthIdentity = response.locals.identity
  if (response.locals.identity) {
    const id: number = response.locals.identity.id
    const tipo: 'cliente' | 'admin' = response.locals.identity.tipo
    // @ts-expect-error La identidad segura no contiene la contraseña.
    response.locals.identity.password
    // @ts-expect-error El ID no se almacena como texto.
    response.locals.identity.id = '7'
    response.locals.identity = { id, tipo }
  }
  // @ts-expect-error Solo existen los tipos cliente y admin.
  requireAccountType('superadmin')
  // @ts-expect-error La titularidad también exige un tipo de cuenta válido.
  requireAccountOwner('superadmin')
  return { middleware, identity, unchecked }
}
