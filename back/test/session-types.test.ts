import type { Request } from 'express'
import type {} from '../src/shared/security/session.types.js'

// Se comprueba con tsc --noEmit; este archivo no se ejecuta.
function checkSessionIdentity(req: Request) {
  req.session.identity = { id: 7, tipo: 'cliente' }
  req.session.identity = { id: 8, tipo: 'admin' }
  req.session.identity = undefined

  // @ts-expect-error El ID de la identidad debe ser numérico.
  req.session.identity = { id: '7', tipo: 'cliente' }
  // @ts-expect-error Solo existen los tipos cliente y admin.
  req.session.identity = { id: 7, tipo: 'superadmin' }
  // @ts-expect-error La identidad no incluye una contraseña.
  req.session.identity = { id: 7, tipo: 'cliente', password: 'dato ficticio' }
}
