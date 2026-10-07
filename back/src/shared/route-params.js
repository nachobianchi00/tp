export function parseRouteId(value) {
    if (typeof value !== 'string') {
        throw new TypeError('Route parameter id must be a single string');
    }
    const id = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(id)) {
        throw new TypeError('Route parameter id must be a safe integer');
    }
    return id;
}
