import { AppError } from './service-errors.js';
export const globalErrorHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    console.error('[Unhandled Error]:', err);
    return res.status(500).json({ message: 'Error interno del servidor' });
};
