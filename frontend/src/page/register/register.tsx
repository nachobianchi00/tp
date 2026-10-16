import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { HttpError } from '../../service/http';
import { authService } from '../../service/auth.service';
import styles from './register.module.css';

const initialForm = {
  nombre: '',
  apellido: '',
  dni: '',
  direccion: '',
  telefono: '',
  mail: '',
  password: '',
  confirmPassword: '',
};

export default function Register() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || success) return;
    // El ref bloquea dos eventos incluso antes de que React deshabilite el formulario.
    busy.current = true;
    setSubmitting(true);
    setError(null);

    try {
      if ([form.nombre, form.apellido, form.direccion, form.telefono, form.mail].some(value => !value.trim())) {
        setError('Completá nombre, apellido, dirección, teléfono y correo electrónico.');
        return;
      }
      const dni = Number(form.dni.trim());
      if (!Number.isSafeInteger(dni) || dni <= 0) {
        setError('El DNI debe ser un número entero positivo y seguro.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.mail.trim())) {
        setError('Ingresá un correo electrónico válido.');
        return;
      }
      // Igual que requirePassword(): comprobar contenido sin transformar la contraseña.
      if (!form.password.trim()) {
        setError('Ingresá una contraseña que no esté vacía ni contenga solamente espacios.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }

    await authService.registerCliente({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      dni,
      direccion: form.direccion.trim(),
      telefono: form.telefono.trim(),
      mail: form.mail.trim().toLowerCase(),
      password: form.password, // la contraseña no se toca
    });
      setSuccess(true);
      setForm(initialForm);
    } catch (cause) {
      setError(cause instanceof HttpError ? cause.message : 'No se pudo crear la cuenta. Intentá nuevamente más tarde.');
    } finally {
      // Ante errores se conservan todos los campos no sensibles.
      setForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.container} aria-labelledby="register-title" aria-busy={submitting}>
      <h1 id="register-title">Crear cuenta</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {success ? (
        <div className={styles.success}>
          <p role="status">Tu cuenta se creó correctamente. Ahora podés iniciar sesión.</p>
          <Link className={styles.link} to="/login">Ir a iniciar sesión</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Las validaciones propias respetan el contrato del backend, también para el correo. */}
          <fieldset className={styles.fields} disabled={submitting}>
            <label htmlFor="register-nombre">Nombre</label>
            <input id="register-nombre" name="nombre" type="text" autoComplete="given-name" required
              value={form.nombre} onChange={event => updateField('nombre', event.target.value)} />

            <label htmlFor="register-apellido">Apellido</label>
            <input id="register-apellido" name="apellido" type="text" autoComplete="family-name" required
              value={form.apellido} onChange={event => updateField('apellido', event.target.value)} />

            <label htmlFor="register-dni">DNI</label>
            <input id="register-dni" name="dni" type="text" inputMode="numeric" required
              value={form.dni} onChange={event => updateField('dni', event.target.value)} />

            <label htmlFor="register-direccion">Dirección</label>
            <input id="register-direccion" name="direccion" type="text" autoComplete="street-address" required
              value={form.direccion} onChange={event => updateField('direccion', event.target.value)} />

            <label htmlFor="register-telefono">Teléfono</label>
            <input id="register-telefono" name="telefono" type="tel" autoComplete="tel" required
              value={form.telefono} onChange={event => updateField('telefono', event.target.value)} />

            <label htmlFor="register-mail">Correo electrónico</label>
            <input id="register-mail" name="mail" type="email" autoComplete="email" required
              value={form.mail} onChange={event => updateField('mail', event.target.value)} />

            <label htmlFor="register-password">Contraseña</label>
            <input id="register-password" name="password" type="password" autoComplete="new-password" required
              value={form.password} onChange={event => updateField('password', event.target.value)} />

            <label htmlFor="register-confirm-password">Confirmación de contraseña</label>
            <input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required
              value={form.confirmPassword} onChange={event => updateField('confirmPassword', event.target.value)} />

            <button className={styles.button} type="submit">
              {submitting ? 'Creando cuenta…' : 'Registrarse'}
            </button>
          </fieldset>
          <Link className={styles.link} to="/login">Ya tengo una cuenta</Link>
        </form>
      )}
    </section>
  );
}