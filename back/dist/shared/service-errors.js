export class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function requireRecord(value) {
    if (!isRecord(value)) {
        throw new AppError('Request body must be an object', 400);
    }
    return value;
}
export function requireAllowedFields(value, allowedFields) {
    const body = requireRecord(value);
    const unexpectedField = Object.keys(body).find(field => !allowedFields.includes(field));
    if (unexpectedField) {
        throw new AppError(`${unexpectedField} cannot be updated`, 400);
    }
    return body;
}
export function requireString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new AppError(`${field} must be a non-empty string`, 400);
    }
    return value.trim();
}
export function requirePositiveInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new AppError(`${field} must be a positive integer`, 400);
    }
    return value;
}
export function requireNonNegativeInteger(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new AppError(`${field} must be a non-negative integer`, 400);
    }
    return value;
}
export function requireNonNegativeAmount(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new AppError(`${field} must be a non-negative amount`, 400);
    }
    return Math.round(value * 100) / 100;
}
export function optionalBoolean(value, field, defaultValue) {
    if (value === undefined)
        return defaultValue;
    if (typeof value !== 'boolean') {
        throw new AppError(`${field} must be a boolean`, 400);
    }
    return value;
}
export function optionalString(value, field) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return requireString(value, field);
}
