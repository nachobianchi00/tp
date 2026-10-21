import bcrypt from 'bcryptjs';
export function hashPassword(password) {
    return bcrypt.hash(password, 10);
}
