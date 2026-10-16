import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Lo que el navegador no puede revisar solo: que el DNI sea un número y que las claves coincidan.
    const dni = Number(form.dni.trim());
    if (!Number.isInteger(dni) || dni <= 0) {
      setError('El DNI debe ser un número.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
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
      console.error(cause); // el detalle técnico queda en la consola
      setError(
        cause instanceof HttpError && cause.status === 409
          ? 'Ya existe una cuenta con esos datos.'
          : 'No se pudo crear la cuenta. Intentá de nuevo.',
      );
      // Se conservan los datos, pero las contraseñas se vacían.
      setForm(previous => ({ ...previous, password: '', confirmPassword: '' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.container}>
      <h1>Crear cuenta</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {success ? (
        <div className={styles.success}>
          <p role="status">Tu cuenta se creó correctamente. Ahora podés iniciar sesión.</p>
          <Link className={styles.link} to="/login" state={location.state}>Ir a iniciar sesión</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          <fieldset className={styles.fields} disabled={submitting}>
            <label htmlFor="register-nombre">Nombre</label>
            <input id="register-nombre" type="text" autoComplete="given-name" required
              value={form.nombre} onChange={event => updateField('nombre', event.target.value)} />

            <label htmlFor="register-apellido">Apellido</label>
            <input id="register-apellido" type="text" autoComplete="family-name" required
              value={form.apellido} onChange={event => updateField('apellido', event.target.value)} />

            <label htmlFor="register-dni">DNI</label>
            <input id="register-dni" type="text" inputMode="numeric" required
              value={form.dni} onChange={event => updateField('dni', event.target.value)} />

            <label htmlFor="register-direccion">Dirección</label>
            <input id="register-direccion" type="text" autoComplete="street-address" required
              value={form.direccion} onChange={event => updateField('direccion', event.target.value)} />

            <label htmlFor="register-telefono">Teléfono</label>
            <input id="register-telefono" type="tel" autoComplete="tel" required
              value={form.telefono} onChange={event => updateField('telefono', event.target.value)} />

            <label htmlFor="register-mail">Correo electrónico</label>
            <input id="register-mail" type="email" autoComplete="email" required
              value={form.mail} onChange={event => updateField('mail', event.target.value)} />

            <label htmlFor="register-password">Contraseña</label>
            <input id="register-password" type="password" autoComplete="new-password" required
              value={form.password} onChange={event => updateField('password', event.target.value)} />

            <label htmlFor="register-confirm-password">Confirmación de contraseña</label>
            <input id="register-confirm-password" type="password" autoComplete="new-password" required
              value={form.confirmPassword} onChange={event => updateField('confirmPassword', event.target.value)} />

            <button className={styles.button} type="submit">
              {submitting ? 'Creando cuenta…' : 'Registrarse'}
            </button>
          </fieldset>
          <Link className={styles.link} to="/login" state={location.state}>Ya tengo una cuenta</Link>
        </form>
      )}
    </section>
  );
}