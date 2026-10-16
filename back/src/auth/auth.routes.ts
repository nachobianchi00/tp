import { Router } from 'express'
import { orm } from '../shared/db/orm.js'
import { Cliente } from '../cliente/cliente.entity.js'
import { Admin } from '../admin/admin.entity.js'
import { ServiceError, requireRecord, requireString, sendServiceError } from '../shared/service-errors.js'

declare module 'express-session' {
  interface SessionData { userId: number; tipo: 'cliente' | 'admin' }
}

const em = orm.em
export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  try {
    const body = requireRecord(req.body)
    const mail = requireString(body.mail, 'mail').toLowerCase()
    const password = requireString(body.password, 'password')
    const tipo = body.tipo === 'admin' ? 'admin' : 'cliente'
    const user = tipo === 'admin'
      ? await em.findOne(Admin, { mail })
      : await em.findOne(Cliente, { mail })
    if (!user || user.password !== password) throw new ServiceError('invalid credentials', 401)
    req.session.userId = user.id
    req.session.tipo = tipo
    res.json({ message: 'logged in', data: { id: user.id, tipo } })
  } catch (error) {
    sendServiceError(res, error)
  }
})

authRouter.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'not logged in' })
  res.json({ message: 'me', data: { id: req.session.userId, tipo: req.session.tipo } })
})

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid')
    res.json({ message: 'logged out' })
  })
})