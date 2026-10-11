import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import { parseRouteId } from '../shared/route-params.js'
import { ServiceError, isRecord } from '../shared/service-errors.js'
import type { AuthIdentity } from '../auth/auth.service.js'
import {
  createPedido,
  cancelarPedido,
  confirmarPedido,
  deletePedido,
  findAllPedidos,
  findPedido,
  updatePedido,
} from './pedido.service.js'

function authenticatedIdentity(res: Response): AuthIdentity {
  if (!res.locals.identity) throw new ServiceError('No autenticado', 401)
  return res.locals.identity
}

function pedidoRouteId(req: Request): number {
  try {
    return parseRouteId(req.params.id)
  } catch (error) {
    if (error instanceof TypeError) throw new ServiceError(error.message, 400)
    throw error
  }
}

async function findAll(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ message: 'found all pedidos', data: await findAllPedidos(authenticatedIdentity(res)) })
  } catch (error: unknown) {
    next(error)
  }
}

async function findOne(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ message: 'found pedido', data: await findPedido(pedidoRouteId(req), authenticatedIdentity(res)) })
  } catch (error: unknown) {
    next(error)
  }
}

async function add(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json({ message: 'pedido created', data: await createPedido(req.body, authenticatedIdentity(res)) })
  } catch (error: unknown) {
    next(error)
  }
}

async function update(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      message: 'pedido updated',
      data: await updatePedido(pedidoRouteId(req), req.body, authenticatedIdentity(res)),
    })
  } catch (error: unknown) {
    next(error)
  }
}

async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await deletePedido(pedidoRouteId(req), authenticatedIdentity(res))
    res.json({ message: 'pedido deleted' })
  } catch (error: unknown) {
    next(error)
  }
}

async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      message: 'pedido confirmed and stock deducted',
      data: await confirmarPedido(pedidoRouteId(req), authenticatedIdentity(res)),
    })
  } catch (error: unknown) {
    next(error)
  }
}

async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      message: 'pedido cancelled',
      data: await cancelarPedido(pedidoRouteId(req), authenticatedIdentity(res)),
    })
  } catch (error: unknown) {
    next(error)
  }
}

export { findAll, findOne, add, update, remove, confirm, cancel }

/** Mantiene errores de negocio previstos y oculta detalles internos del ORM, parser o sesión. */
export const pedidoErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error)
  res.set('Cache-Control', 'no-store')
  if (error instanceof ServiceError && [400, 401, 403, 404, 409].includes(error.statusCode)) {
    res.status(error.statusCode).json({ message: error.message })
    return
  }
  const parseErrors: Record<string, { status: number; message: string }> = {
    'entity.parse.failed': { status: 400, message: 'JSON inválido' },
    'entity.too.large': { status: 413, message: 'Solicitud demasiado grande' },
    'charset.unsupported': { status: 415, message: 'Codificación no admitida' },
    'encoding.unsupported': { status: 415, message: 'Codificación no admitida' },
  }
  const parserError = isRecord(error) && typeof error.type === 'string'
    && Object.hasOwn(parseErrors, error.type) ? parseErrors[error.type] : undefined
  if (parserError) {
    res.status(parserError.status).json({ message: parserError.message })
    return
  }
  res.status(500).json({ message: 'No se pudo procesar la solicitud de pedidos' })
}
