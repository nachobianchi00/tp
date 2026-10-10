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
/*En Express, req.params.id siempre llega como string, y en los tipos más nuevos puede ser string | string[] (por eso el parámetro tiene ese tipo). La función se asegura de que, cuando la usás en una query, tengas un number confiable.*/ 
