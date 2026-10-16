import { NextFunction, Request, Response } from 'express'
import { AppError } from './service-errors.js'

export const globalErrorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message })
  }

  console.error('[Unhandled Error]:', err)
  return res.status(500).json({ message: 'Error interno del servidor' })
}