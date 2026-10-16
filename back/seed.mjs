// Carga datos de prueba usando la API. Uso (con el back corriendo): node seed.mjs
const API = 'http://localhost:3000/api'

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${path}: ${json.message}`)
  return json.data
}

const existentes = await (await fetch(`${API}/categorias`)).json()
if (existentes.data.length > 0) {
  console.log('Ya hay categorías cargadas. No se hizo nada.')
  process.exit(0)
}

// Categorías: guardamos el id de cada una por nombre
const nombresCategorias = ['Ofertas', 'Almacén', 'Bebidas', 'Lácteos', 'Frutas y verduras', 'Carnes', 'Limpieza', 'Panadería']
const cat = {}
for (const nombre of nombresCategorias) {
  cat[nombre] = (await post('/categorias', { nombre })).id
}

// [nombre, descripcion, precio, stock, categorías]
const productos = [
  ['Arroz largo fino 1 kg', 'Arroz largo fino de grano suelto.', 1850, 60, ['Almacén', 'Ofertas']],
  ['Fideos spaghetti 500 g', 'Fideos secos de sémola.', 1200, 80, ['Almacén']],
  ['Aceite de girasol 900 ml', 'Aceite de girasol para cocinar.', 3200, 40, ['Almacén']],
  ['Yerba mate 1 kg', 'Yerba mate con palo.', 5400, 35, ['Almacén']],
  ['Azúcar 1 kg', 'Azúcar blanca refinada.', 1500, 70, ['Almacén']],
  ['Harina 000 1 kg', 'Harina de trigo para todo uso.', 1100, 90, ['Almacén']],
  ['Galletitas dulces 300 g', 'Galletitas dulces rellenas.', 1700, 50, ['Almacén']],
  ['Gaseosa cola 2,25 L', 'Gaseosa sabor cola.', 3300, 45, ['Bebidas', 'Ofertas']],
  ['Agua mineral 2 L', 'Agua mineral sin gas.', 1400, 100, ['Bebidas']],
  ['Cerveza lager 1 L', 'Cerveza rubia en botella retornable.', 2600, 30, ['Bebidas']],
  ['Jugo de naranja 1 L', 'Jugo de naranja exprimido.', 1900, 25, ['Bebidas']],
  ['Vino tinto malbec 750 ml', 'Vino tinto malbec mendocino.', 6800, 0, ['Bebidas']],
  ['Leche entera 1 L', 'Leche entera larga vida.', 1600, 120, ['Lácteos', 'Ofertas']],
  ['Yogur natural 1 kg', 'Yogur natural firme.', 2100, 30, ['Lácteos']],
  ['Queso cremoso 1 kg', 'Queso cremoso para fundir.', 9500, 20, ['Lácteos']],
  ['Manteca 200 g', 'Manteca de primera calidad.', 2800, 40, ['Lácteos']],
  ['Manzana roja 1 kg', 'Manzana roja fresca.', 2400, 50, ['Frutas y verduras']],
  ['Banana 1 kg', 'Banana madura de estación.', 2100, 50, ['Frutas y verduras']],
  ['Tomate redondo 1 kg', 'Tomate redondo para ensalada.', 2900, 40, ['Frutas y verduras']],
  ['Papa 1 kg', 'Papa blanca lavada.', 1300, 80, ['Frutas y verduras']],
  ['Asado 1 kg', 'Tira de asado fresca.', 12900, 25, ['Carnes']],
  ['Pechuga de pollo 1 kg', 'Pechuga de pollo sin hueso.', 7800, 30, ['Carnes', 'Ofertas']],
  ['Carne picada 1 kg', 'Carne picada común.', 8900, 30, ['Carnes']],
  ['Detergente 750 ml', 'Detergente para vajilla.', 2300, 60, ['Limpieza', 'Ofertas']],
  ['Lavandina 1 L', 'Lavandina concentrada.', 1200, 70, ['Limpieza']],
  ['Papel higiénico x4', 'Papel higiénico doble hoja.', 3600, 55, ['Limpieza']],
  ['Pan lactal 500 g', 'Pan lactal blanco en rodajas.', 2700, 35, ['Panadería']],
  ['Medialunas x6', 'Medialunas de manteca.', 3200, 20, ['Panadería', 'Ofertas']],
  ['Pan para hamburguesas x4', 'Panes con semillas.', 2500, 30, ['Panadería']],
]
for (const [nombre, descripcion, precio, cantidad, categorias] of productos) {
  await post('/productos', { nombre, descripcion, precio, cantidad, categorias: categorias.map((c) => cat[c]) })
}

// Métodos de envío y de pago
await post('/metodos-envio', { descripcion: 'Retiro en sucursal', costo: 0, requiereDireccion: false, tiempoEstimado: 'Disponible en el día' })
await post('/metodos-envio', { descripcion: 'Envío a domicilio', costo: 2500, requiereDireccion: true, tiempoEstimado: '24 a 48 hs' })
await post('/metodos-pago', { descripcion: 'Efectivo' })
await post('/metodos-pago', { descripcion: 'Mercado Pago' })
await post('/metodos-pago', { descripcion: 'Transferencia bancaria' })

console.log(`Listo: ${nombresCategorias.length} categorías, ${productos.length} productos, 2 métodos de envío y 3 de pago.`)
