import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/shared/security/password.ts'

// Ejecutar desde back/ con Node 24: node --test test/password.test.mjs
// Estas pruebas solo importan la utilidad de contraseñas; no cargan el ORM ni el servidor.

test('genera un hash Argon2id y verifica la contraseña correcta', async () => {
  const password = 'Clave ficticia para MiniGo 123!'
  const storedHash = await hashPassword(password)

  assert.match(storedHash, /^\$argon2id\$/)
  assert.notEqual(storedHash, password)
  assert.equal(await verifyPassword(storedHash, password), true)
})

test('rechaza una contraseña incorrecta sin lanzar un error', async () => {
  const storedHash = await hashPassword('Otra clave ficticia 456!')

  assert.equal(await verifyPassword(storedHash, 'Una clave diferente 456!'), false)
})

test('genera hashes distintos para la misma contraseña y ambos verifican', async () => {
  const password = 'Misma clave ficticia 789!'
  const firstHash = await hashPassword(password)
  const secondHash = await hashPassword(password)

  assert.notEqual(firstHash, secondHash)
  assert.equal(await verifyPassword(firstHash, password), true)
  assert.equal(await verifyPassword(secondHash, password), true)
})

test('conserva los espacios al principio y al final', async () => {
  const password = '  Clave ficticia con espacios 123!  '
  const storedHash = await hashPassword(password)

  assert.equal(await verifyPassword(storedHash, password), true)
  assert.equal(await verifyPassword(storedHash, password.trimStart()), false)
  assert.equal(await verifyPassword(storedHash, password.trimEnd()), false)
})

test('conserva caracteres Unicode en la contraseña', async () => {
  const password = 'Contraseña ficticia: ñ, á y 🛒 123!'
  const storedHash = await hashPassword(password)

  assert.equal(await verifyPassword(storedHash, password), true)
  assert.equal(await verifyPassword(storedHash, password.replace('ñ', 'n')), false)
})

test('informa un error si se intenta verificar texto plano o un hash dañado', async () => {
  const password = 'Clave ficticia de prueba 123!'

  await assert.rejects(() => verifyPassword('texto plano ficticio', password), Error)
  await assert.rejects(() => verifyPassword('$argon2id$hash-dañado', password), Error)
})
