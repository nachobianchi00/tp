-- MiniGo: datos ficticios y descartables, SOLO para desarrollo local.
-- Abrir este archivo en MySQL Workbench conectado a tu MySQL LOCAL.
-- Seleccionar minigo_dev como esquema predeterminado antes de ejecutar.
-- Las tablas deben haber sido creadas por syncSchema() al arrancar el backend.
-- La condicion DATABASE() = 'minigo_dev' evita insertar en otro esquema.
-- NO prueba que el servidor sea local: verificar host y puerto en Workbench.
-- NO utilizar en produccion ni en una base compartida.
--
-- Credenciales PUBLICAS del Admin, solo para desarrollo local:
-- Mail: admin.dev@minigo.example
-- Clave: MiniGo-DEV-2026!
-- Nombre, apellido y DNI son ficticios; no representan a una persona real.
-- Hash generado con hashPassword() de src/shared/security/password.ts:
-- Argon2id con salt aleatorio; verificado con verifyPassword().
-- No reemplaza contrasenas ni otros datos de cuentas existentes.
--
-- Nombres confirmados mediante entidades de src/ y UnderscoreNamingStrategy:
-- categoria: id, nombre (UNIQUE), categoria_padre_id (FK nullable a categoria).
-- producto: id, nombre, descripcion, precio, cantidad, estado.
-- Producto.categorias es el lado propietario; Categoria.productos es inverso.
-- producto_categorias: producto_id, categoria_id (PK compuesta y dos FK).
-- metodo_pago: id, descripcion, estado.
-- metodo_envio: id, descripcion, costo, requiere_direccion,
--               tiempo_estimado, estado, observacion.
-- admin: id, nombre, apellido, dni (UNIQUE), mail (UNIQUE), password.
--
-- Reejecutable de forma SECUENCIAL: cada INSERT comprueba existencia.
-- No depende de INSERT IGNORE ni de IDs autoincrementales fijos.
-- No ejecutar dos copias simultaneamente: producto y metodos no tienen
-- UNIQUE por nombre/descripcion. No repara duplicados que ya existan.
-- Los nombres [DEV] identifican estos ejemplos; no renombrarlos si se
-- quiere conservar la misma identidad de datos al volver a ejecutar.
-- Solo INSERT; no crea esquemas ni tablas, no actualiza ni elimina filas.

INSERT INTO categoria (nombre, categoria_padre_id)
SELECT datos.nombre, NULL
FROM (
    SELECT '[DEV] Alimentos' AS nombre
    UNION ALL SELECT '[DEV] Bebidas'
    UNION ALL SELECT '[DEV] Limpieza'
) AS datos
LEFT JOIN categoria AS existente ON existente.nombre = datos.nombre
WHERE existente.id IS NULL AND DATABASE() = 'minigo_dev';

INSERT INTO producto (nombre, descripcion, precio, cantidad, estado)
SELECT datos.nombre, datos.descripcion, datos.precio, datos.cantidad, 1
FROM (
    SELECT '[DEV] Agua 500 ml' AS nombre,
           'Producto ficticio para probar el catalogo' AS descripcion,
           1000.00 AS precio, 20 AS cantidad
    UNION ALL SELECT '[DEV] Galletitas', 'Producto ficticio para probar pedidos', 1500.00, 15
    UNION ALL SELECT '[DEV] Jabon', 'Producto ficticio de limpieza', 800.00, 10
) AS datos
LEFT JOIN producto AS existente ON existente.nombre = datos.nombre
WHERE existente.id IS NULL AND DATABASE() = 'minigo_dev';

-- Buscar las entidades por nombre; nunca asumir IDs como 1, 2 o 3.
-- MIN(id) elige una sola fila si ya habia productos de igual nombre.
INSERT INTO producto_categorias (producto_id, categoria_id)
SELECT productos.id, categorias.id
FROM (
    SELECT '[DEV] Agua 500 ml' AS producto_nombre, '[DEV] Bebidas' AS categoria_nombre
    UNION ALL SELECT '[DEV] Agua 500 ml', '[DEV] Alimentos'
    UNION ALL SELECT '[DEV] Galletitas', '[DEV] Alimentos'
    UNION ALL SELECT '[DEV] Jabon', '[DEV] Limpieza'
) AS datos
INNER JOIN (
    SELECT nombre, MIN(id) AS id FROM producto GROUP BY nombre
) AS productos ON productos.nombre = datos.producto_nombre
INNER JOIN categoria AS categorias ON categorias.nombre = datos.categoria_nombre
LEFT JOIN producto_categorias AS existente
    ON existente.producto_id = productos.id AND existente.categoria_id = categorias.id
WHERE existente.producto_id IS NULL AND DATABASE() = 'minigo_dev';

INSERT INTO metodo_pago (descripcion, estado)
SELECT datos.descripcion, 1
FROM (
    SELECT '[DEV] Efectivo' AS descripcion
    UNION ALL SELECT '[DEV] Transferencia'
) AS datos
LEFT JOIN metodo_pago AS existente ON existente.descripcion = datos.descripcion
WHERE existente.id IS NULL AND DATABASE() = 'minigo_dev';

INSERT INTO metodo_envio
    (descripcion, costo, requiere_direccion, tiempo_estimado, estado, observacion)
SELECT datos.descripcion, datos.costo, datos.requiere_direccion, datos.tiempo_estimado, 1, datos.observacion
FROM (
    SELECT '[DEV] Retiro en local' AS descripcion, 0.00 AS costo,
           0 AS requiere_direccion, 'En el dia' AS tiempo_estimado,
           'Ejemplo ficticio: retiro sin envio' AS observacion
    UNION ALL SELECT '[DEV] Envio a domicilio', 1500.00, 1, '24 a 48 horas', 'Ejemplo ficticio de envio local'
) AS datos
LEFT JOIN metodo_envio AS existente ON existente.descripcion = datos.descripcion
WHERE existente.id IS NULL AND DATABASE() = 'minigo_dev';

-- Si ya hay una cuenta con este mail O este DNI, no insertar ni modificarla.
-- En ese caso la clave publica no reemplaza la clave previa; revisar el
-- conflicto manualmente en la base local, sin borrar cuentas automaticamente.
INSERT INTO admin (nombre, apellido, dni, mail, password)
SELECT datos.nombre, datos.apellido, datos.dni, datos.mail, datos.password
FROM (
    SELECT 'Admin' AS nombre, 'Desarrollo' AS apellido, 900000001 AS dni,
           'admin.dev@minigo.example' AS mail,
           '$argon2id$v=19$m=65536,p=4,t=3$jjRuT6UITXjA/Lp6WO5b9Q$3YwXQbLVl+7Xb1wYpFapmKBtwfKgI8+5nymwS66X1eQ' AS password
) AS datos
LEFT JOIN admin AS existente ON existente.mail = datos.mail OR existente.dni = datos.dni
WHERE existente.id IS NULL AND DATABASE() = 'minigo_dev';
