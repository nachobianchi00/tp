import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthError, authService } from '../../service/auth.service';
import styles from './register.module.css';

const formularioInicial = {
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
  const [formulario, establecerFormulario] = useState(formularioInicial);
  const [enviando, establecerEnviando] = useState(false);
  const [registroCompleto, establecerRegistroCompleto] = useState(false);
  const [error, establecerError] = useState<string | null>(null);
  const operacionEnCurso = useRef(false);

  function actualizarCampo(campo: keyof typeof formularioInicial, valor: string) {
    establecerFormulario(anterior => ({ ...anterior, [campo]: valor }));
  }

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (operacionEnCurso.current || registroCompleto) return;
    // El ref bloquea dos eventos incluso antes de que React deshabilite el formulario.
    operacionEnCurso.current = true;
    establecerEnviando(true);
    establecerError(null);

    try {
      if ([formulario.nombre, formulario.apellido, formulario.direccion, formulario.telefono, formulario.mail].some(valor => !valor.trim())) {
        establecerError('Completá nombre, apellido, dirección, teléfono y correo electrónico.');
        return;
      }
      const dni = Number(formulario.dni.trim());
      if (!Number.isSafeInteger(dni) || dni <= 0) {
        establecerError('El DNI debe ser un número entero positivo y seguro.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.mail.trim())) {
        establecerError('Ingresá un correo electrónico válido.');
        return;
      }
      // Igual que requirePassword(): comprobar contenido sin transformar la contraseña.
      if (!formulario.password.trim()) {
        establecerError('Ingresá una contraseña que no esté vacía ni contenga solamente espacios.');
        return;
      }
      if (formulario.password !== formulario.confirmPassword) {
        establecerError('Las contraseñas no coinciden.');
        return;
      }

      await authService.registerCliente({
        nombre: formulario.nombre,
        apellido: formulario.apellido,
        dni,
        direccion: formulario.direccion,
        telefono: formulario.telefono,
        mail: formulario.mail,
        password: formulario.password,
      });
      establecerRegistroCompleto(true);
      establecerFormulario(formularioInicial);
    } catch (causa) {
      establecerError(causa instanceof AuthError ? causa.message : 'No se pudo crear la cuenta. Intentá nuevamente más tarde.');
    } finally {
      // Ante errores se conservan todos los campos no sensibles.
      establecerFormulario(anterior => ({ ...anterior, password: '', confirmPassword: '' }));
      operacionEnCurso.current = false;
      establecerEnviando(false);
    }
  }

  return (
    <section className={styles.container} aria-labelledby="register-title" aria-busy={enviando}>
      <h1 id="register-title">Crear cuenta</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}

      {registroCompleto ? (
        <div className={styles.success}>
          <p role="status">Tu cuenta se creó correctamente. Ahora podés iniciar sesión.</p>
          <Link className={styles.link} to="/login">Ir a iniciar sesión</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={enviarFormulario} noValidate>
          {/* Las validaciones propias respetan el contrato del backend, también para el correo. */}
          <fieldset className={styles.fields} disabled={enviando}>
            <label htmlFor="register-nombre">Nombre</label>
            <input id="register-nombre" name="nombre" type="text" autoComplete="given-name" required
              value={formulario.nombre} onChange={evento => actualizarCampo('nombre', evento.target.value)} />

            <label htmlFor="register-apellido">Apellido</label>
            <input id="register-apellido" name="apellido" type="text" autoComplete="family-name" required
              value={formulario.apellido} onChange={evento => actualizarCampo('apellido', evento.target.value)} />

            <label htmlFor="register-dni">DNI</label>
            <input id="register-dni" name="dni" type="text" inputMode="numeric" required
              value={formulario.dni} onChange={evento => actualizarCampo('dni', evento.target.value)} />

            <label htmlFor="register-direccion">Dirección</label>
            <input id="register-direccion" name="direccion" type="text" autoComplete="street-address" required
              value={formulario.direccion} onChange={evento => actualizarCampo('direccion', evento.target.value)} />

            <label htmlFor="register-telefono">Teléfono</label>
            <input id="register-telefono" name="telefono" type="tel" autoComplete="tel" required
              value={formulario.telefono} onChange={evento => actualizarCampo('telefono', evento.target.value)} />

            <label htmlFor="register-mail">Correo electrónico</label>
            <input id="register-mail" name="mail" type="email" autoComplete="email" required
              value={formulario.mail} onChange={evento => actualizarCampo('mail', evento.target.value)} />

            <label htmlFor="register-password">Contraseña</label>
            <input id="register-password" name="password" type="password" autoComplete="new-password" required
              value={formulario.password} onChange={evento => actualizarCampo('password', evento.target.value)} />

            <label htmlFor="register-confirm-password">Confirmación de contraseña</label>
            <input id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required
              value={formulario.confirmPassword} onChange={evento => actualizarCampo('confirmPassword', evento.target.value)} />

            <button className={styles.button} type="submit">
              {enviando ? 'Creando cuenta…' : 'Registrarse'}
            </button>
          </fieldset>
          <Link className={styles.link} to="/login">Ya tengo una cuenta</Link>
        </form>
      )}
    </section>
  );
}
