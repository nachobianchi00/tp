import type { AuthIdentity } from './auth.service.js'
import { ServiceError, isRecord } from '../shared/service-errors.js'

/** Estado interno de cuenta o sesión; authVersion nunca forma parte de la identidad pública. */
export interface AccountAuthState extends AuthIdentity {
  authVersion: number
}

/** La futura implementación debe consultar el estado vigente por tipo e ID, sin usar datos antiguos. */
export type AccountAuthLookup = (identity: Readonly<AuthIdentity>) => Promise<AccountAuthState | null>

function isAccountAuthState(value: unknown): value is AccountAuthState {
  return isRecord(value)
    && Object.hasOwn(value, 'id') && Object.hasOwn(value, 'tipo') && Object.hasOwn(value, 'authVersion')
    && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0
    && (value.tipo === 'cliente' || value.tipo === 'admin')
    && typeof value.authVersion === 'number' && Number.isSafeInteger(value.authVersion)
    && value.authVersion >= 0
}

/** Base aislada: no importa el ORM ni modifica cuentas o sesiones. */
export function createAccountAuthVerifier(lookup: AccountAuthLookup): (value: unknown) => Promise<AuthIdentity | null> {
  return async value => {
    // No existe una alternativa para sesiones antiguas sin versión.
    if (!isAccountAuthState(value)) return null
    // Copiar antes de esperar evita que cambios en el objeto original alteren esta comprobación.
    const { id, tipo, authVersion } = value
    let account: unknown
    try {
      account = await lookup({ id, tipo })
    } catch {
      // Tampoco se propagan errores de negocio o detalles del almacenamiento inyectado.
      throw new ServiceError('No se pudo verificar el estado de autenticación', 500)
    }

    if (!isAccountAuthState(account) || account.id !== id || account.tipo !== tipo
      || account.authVersion !== authVersion) return null

    // No se devuelve la cuenta, la versión ni otras propiedades del almacenamiento.
    return { id, tipo }
  }
}
