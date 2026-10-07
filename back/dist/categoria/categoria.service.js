import { orm } from '../shared/db/orm.js';
import { isRecord, ServiceError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js';
import { Categoria } from './categoria.entity.js';
const em = orm.em;
export async function findAllCategorias() {
    return em.find(Categoria, {}, { populate: ['subcategorias', 'productos'] });
}
export async function findCategoria(id) {
    const categoria = await em.findOne(Categoria, { id }, { populate: ['subcategorias', 'productos'] });
    if (!categoria)
        throw new ServiceError('Categoria not found', 404);
    return categoria;
}
export async function createCategoria(value) {
    const body = requireRecord(value);
    const nombre = requireString(body.nombre, 'nombre');
    const categoriaPadreValue = isRecord(body.categoriaPadre)
        ? body.categoriaPadre.id
        : body.categoriaPadre;
    const padreId = body.categoriaPadre === undefined || body.categoriaPadre === null
        ? undefined
        : requirePositiveInteger(categoriaPadreValue, 'categoriaPadre');
    if (await em.findOne(Categoria, { nombre })) {
        throw new ServiceError('A category with this name already exists', 409);
    }
    const categoriaPadre = padreId === undefined
        ? undefined
        : await em.findOne(Categoria, { id: padreId });
    if (padreId !== undefined && !categoriaPadre) {
        throw new ServiceError('Parent category not found', 404);
    }
    const categoria = em.create(Categoria, { nombre, categoriaPadre });
    await em.flush();
    return categoria;
}
export async function updateCategoria(id, value) {
    const categoria = await findCategoria(id);
    const body = requireRecord(value);
    em.assign(categoria, body);
    await em.flush();
    return categoria;
}
export async function deleteCategoria(id) {
    const categoria = await findCategoria(id);
    em.remove(categoria);
    await em.flush();
}
