export class ServiceError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function requireRecord(value) {
    if (!isRecord(value)) {
        throw new ServiceError('Request body must be an object', 400);
    }
    return value;
}
export function requireString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ServiceError(`${field} must be a non-empty string`, 400);
    }
    return value.trim();
}
export function requirePositiveInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new ServiceError(`${field} must be a positive integer`, 400);
    }
    return value;
}
export function requireNonNegativeInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new ServiceError(`${field} must be a non-negative integer`, 400);
    }
    return value;
}
export function requireNonNegativeAmount(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new ServiceError(`${field} must be a non-negative amount`, 400);
    }
    return Math.round(value * 100) / 100;
}
export function optionalBoolean(value, field, defaultValue) {
    if (value === undefined)
        return defaultValue;
    if (typeof value !== 'boolean') {
        throw new ServiceError(`${field} must be a boolean`, 400);
    }
    return value;
}
export function optionalString(value, field) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return requireString(value, field);
}
export function sendServiceError(res, error) {
    if (error instanceof ServiceError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    if (error instanceof TypeError || error instanceof RangeError) {
        return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
        message: error instanceof Error ? error.message : String(error),
    });
}
