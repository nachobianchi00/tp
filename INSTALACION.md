MiniGo: Guía para correr el proyecto

Para una mejor visualización del documento podes leerlo desde:
https://docs.google.com/document/d/1FkrbYQ9soXI2_luS8Z6HZ8vmv_qvCndis6PxhYpH5L4/edit?usp=sharing



Antes de empezar

Necesitás tener instalado:

Git
Node 24 (mínimo 22.17): node --version
pnpm: pnpm --version (si PowerShell lo bloquea, usá pnpm.cmd)
MySQL corriendo en tu PC y MySQL Workbench

Usá siempre una base MySQL propia, en tu PC. El backend crea y modifica tablas solo al arrancar (syncSchema()). Nunca lo apuntes a una base compartida.

1. Clonar e instalar
powershell
git clone --branch feature/login https://github.com/nachobianchi00/tp.git
cd tp
cd back
pnpm install
cd ../frontend
pnpm install
cd ..

2. Crear tu base de datos

En Workbench, conectate a tu MySQL local (127.0.0.1) y ejecutá:

sql
CREATE DATABASE minigo_dev CHARACTER SET utf8mb4;

3. Configurar el backend

Desde la carpeta tp:

powershell
Copy-Item back/.env.example back/.env.local

Abrí back/.env.local con VS Code y completá estas dos líneas:

dotenv
DATABASE_URL=mysql://TU_USUARIO:TU_CLAVE@127.0.0.1:3306/minigo_dev
SESSION_SECRET=PEGAR_ACA_UN_SECRETO
Para generar el secreto: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" y pegá el resultado.
Si tu clave de MySQL tiene @ : / # %, escribilos codificados: @ → %40, : → %3A, / → %2F, # → %23, % → %25.
Dejá las demás líneas como están. No subas este archivo a Git (ya está ignorado).

Chequeo rápido: este comando tiene que salir vacío. Si muestra algo, hay una variable del sistema pisando tu configuración y hay que quitarla antes de seguir.

powershell
echo $env:DATABASE_URL

4. Arrancar

Necesitás dos terminales abiertas a la vez.

Terminal 1: backend (la primera vez crea las tablas):

powershell
cd back
pnpm start:dev

Esperá a que diga que el servidor escucha en el puerto 3000 y dejala abierta.

Terminal 2: frontend:

powershell
cd frontend
pnpm dev

Abrí http://localhost:5173 (tiene que ser exactamente ese puerto).

5. Cargar datos de ejemplo

Con el backend ya arrancado una vez (así existen las tablas):

En Workbench, abrí tu conexión local y hacé doble clic en minigo_dev (queda en negrita).
File → Open SQL Script → elegí back/sql/seed-dev.sql.
Ejecutalo (rayo). Si lo corrés dos veces, no duplica datos.

6. Probar que anda
Qué	Dónde	Datos
Crear una cuenta de cliente	/registro	Los que quieras (ficticios)
Entrar como cliente	/login	La cuenta que creaste
Entrar como administrador	/admin/login	admin.dev@minigo.example / MiniGo-DEV-2026!

El acceso de administrador no aparece en el menú: se entra escribiendo la URL.

Esa cuenta de administrador es pública y solo para desarrollo local. No la uses en ningún entorno compartido o publicado.

7. Pruebas automáticas (opcional)

No necesitan MySQL ni el backend corriendo.

powershell
cd back
pnpm exec tsc --noEmit
$t = @(Get-ChildItem test -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
node --experimental-test-module-mocks --test @t

cd ../frontend
node --test test/auth-service.test.mjs
pnpm build
Si algo falla
Problema	Solución
.env.local: not found	Ejecutá pnpm start:dev desde la carpeta back, y verificá que back/.env.local exista.
El backend no conecta	Revisá usuario, clave, puerto y que minigo_dev exista. Revisá los caracteres especiales de la clave.
401 al iniciar sesión	Verificá el correo y la clave. Cliente entra por /login; administrador, por /admin/login.
403 en el login o al registrarte	El frontend tiene que estar en http://localhost:5173. Si el puerto estaba ocupado, cerrá lo que lo usa y reiniciá.
El seed no inserta nada	Seleccioná minigo_dev con doble clic y volvé a ejecutarlo.
Los productos del seed no se ven en la página	Es normal: el catálogo del frontend todavía usa datos de ejemplo internos.