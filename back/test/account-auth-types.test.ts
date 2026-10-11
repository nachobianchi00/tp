import type { AuthIdentity } from '../src/auth/auth.service.js'
import {
  createAccountAuthVerifier,
  type AccountAuthLookup,
  type AccountAuthState,
} from '../src/auth/account-auth.service.js'

// Solo se comprueba con TypeScript; no se ejecuta ni se importa el ORM.
async function checkAccountAuthTypes() {
  const state: AccountAuthState = { id: 7, tipo: 'cliente', authVersion: 0 }
  const lookup: AccountAuthLookup = async identity => {
    // @ts-expect-error La consulta no debe modificar su clave de búsqueda.
    identity.id = 8
    return { id: identity.id, tipo: identity.tipo, authVersion: 0 }
  }
  const verify = createAccountAuthVerifier(lookup)
  const identity: AuthIdentity | null = await verify(state)
  if (identity) {
    // @ts-expect-error La identidad pública no expone la versión interna.
    identity.authVersion
    // @ts-expect-error La identidad pública no contiene contraseñas.
    identity.password
  }
  // @ts-expect-error La versión es obligatoria en el estado interno.
  const absent: AccountAuthState = { id: 7, tipo: 'admin' }
  // @ts-expect-error La versión no acepta strings.
  const text: AccountAuthState = { id: 7, tipo: 'admin', authVersion: '0' }
  // @ts-expect-error Solo existen los tipos cliente y admin.
  const role: AccountAuthState = { id: 7, tipo: 'otro', authVersion: 0 }
  // @ts-expect-error La consulta debe devolver el estado completo o null.
  const incomplete: AccountAuthLookup = async () => ({ id: 7, tipo: 'cliente' })
  return { identity, absent, text, role, incomplete }
}
