import { orm } from '../shared/db/orm.js';
import { ServiceError, requirePositiveInteger, requireRecord, requireString } from '../shared/service-errors.js';
import { Admin } from './admin.entity.js';
const em = orm.em;
function parseAdmin(value) {
    const body = requireRecord(value);
    const nombre = requireString(body.nombre, 'nombre');
    const apellido = requireString(body.apellido, 'apellido');
    const dni = requirePositiveInteger(body.dni, 'dni');
    const mail = requireString(body.mail, 'mail').toLowerCase();
    const password = requireString(body.password, 'password');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        throw new ServiceError('mail must be a valid email address', 400);
    }
    return { nombre, apellido, dni, mail, password };
}
export async function findAllAdmins() {
    return em.find(Admin, {});
}
export async function findAdmin(id) {
    const admin = await em.findOne(Admin, { id });
    if (!admin)
        throw new ServiceError('Admin not found', 404);
    return admin;
}
export async function createAdmin(value) {
    const input = parseAdmin(value);
    if (await em.findOne(Admin, { mail: input.mail })) {
        throw new ServiceError('An admin with this email already exists', 409);
    }
    if (await em.findOne(Admin, { dni: input.dni })) {
        throw new ServiceError('An admin with this DNI already exists', 409);
    }
    const admin = em.create(Admin, input);
    await em.flush();
    return admin;
}
export async function updateAdmin(id, value) {
    const admin = await findAdmin(id);
    const body = requireRecord(value);
    em.assign(admin, body);
    await em.flush();
    return admin;
}
export async function deleteAdmin(id) {
    const admin = await findAdmin(id);
    em.remove(admin);
    await em.flush();
}
