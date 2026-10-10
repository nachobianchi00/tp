import { orm } from '../shared/db/orm.js';
import { ServiceError, optionalBoolean, requireNonNegativeAmount, requireNonNegativeInteger, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js';
import { Categoria } from '../categoria/categoria.entity.js';
import { Producto } from './producto.entity.js';
const em = orm.em;
const MAX_PRODUCT_PRICE = 99_999_999.99;
async function findCategorias(value) {
    if (!Array.isArray(value)) {
        throw new ServiceError('categorias must be an array of category IDs', 400);
    }
    const categoriaIds = value.map((id, index) => requirePositiveInteger(id, `categorias[${index}]`));
    if (new Set(categoriaIds).size !== categoriaIds.length) {
        throw new ServiceError('categorias must not contain duplicate IDs', 400);
    }
    const categorias = await em.find(Categoria, { id: { $in: categoriaIds } });
    if (categorias.length !== categoriaIds.length) {
        throw new ServiceError('One or more categories were not found', 404);
    }
    return categorias;
}
function validateProductPrice(precio) {
    if (precio > MAX_PRODUCT_PRICE) {
        throw new ServiceError('precio exceeds the supported amount', 400);
    }
}
export async function findAllProductos() {
    return em.find(Producto, {}, { populate: ['categorias'] });
}
export async function findProducto(id) {
    const producto = await em.findOne(Producto, { id }, { populate: ['categorias'] });
    if (!producto)
        throw new ServiceError('Producto not found', 404);
    return producto;
}
export async function createProducto(value) {
    const body = requireRecord(value);
    const nombre = requireString(body.nombre, 'nombre');
    const descripcion = requireString(body.descripcion, 'descripcion');
    const precio = requireNonNegativeAmount(body.precio, 'precio');
    const cantidad = requireNonNegativeInteger(body.cantidad, 'cantidad');
    const estado = optionalBoolean(body.estado, 'estado', true);
    validateProductPrice(precio);
    const categorias = body.categorias === undefined ? [] : await findCategorias(body.categorias);
    const producto = em.create(Producto, { nombre, descripcion, precio, cantidad, estado });
    producto.categorias.set(categorias);
    await em.flush();
    return producto;
}
export async function updateProducto(id, value) {
    const producto = await findProducto(id);
    const body = requireRecord(value);
    const updates = {};
    if ('nombre' in body)
        updates.nombre = requireString(body.nombre, 'nombre');
    if ('descripcion' in body)
        updates.descripcion = requireString(body.descripcion, 'descripcion');
    if ('precio' in body) {
        updates.precio = requireNonNegativeAmount(body.precio, 'precio');
        validateProductPrice(updates.precio);
    }
    if ('cantidad' in body)
        updates.cantidad = requireNonNegativeInteger(body.cantidad, 'cantidad');
    if ('estado' in body)
        updates.estado = optionalBoolean(body.estado, 'estado', true);
    const categorias = body.categorias === undefined ? undefined : await findCategorias(body.categorias);
    em.assign(producto, updates);
    if (categorias !== undefined)
        producto.categorias.set(categorias);
    await em.flush();
    return producto;
}
export async function deleteProducto(id) {
    const producto = await findProducto(id);
    em.remove(producto);
    await em.flush();
}
