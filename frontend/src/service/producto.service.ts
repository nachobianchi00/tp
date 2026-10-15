import type { ProductType } from '../type/productType';

export class ProductoError extends Error {
  readonly status: number | undefined;
  readonly kind: 'http' | 'network' | 'response';

  constructor(message: string, kind: ProductoError['kind'], status?: number) {
    super(message);
    this.name = 'ProductoError';
    this.kind = kind;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convierte el producto del backend al tipo que ya usan las páginas. */
function productFrom(value: unknown): ProductType {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.nombre !== 'string'
    || typeof value.precio !== 'number' || typeof value.cantidad !== 'number') {
    throw new ProductoError('El servidor devolvió un producto inválido.', 'response');
  }
  // El backend permite varias categorías; la UI actual muestra una sola.
  const categorias = Array.isArray(value.categorias) ? value.categorias : [];
  const primera = categorias.find(isRecord);
  const category = primera && typeof primera.id === 'number' && typeof primera.nombre === 'string'
    ? { id: primera.id, name: primera.nombre }
    : { id: 0, name: 'Sin categoría' };

  return {
    id: value.id,
    name: value.nombre,
    price: value.precio,
    stock: value.cantidad,
    // El backend todavía no tiene imagen: se usa un placeholder.
    image: `https://placehold.co/300x300?text=${encodeURIComponent(value.nombre)}`,
    category,
  };
}

export function createProductoService(fetcher: typeof fetch = (...args) => fetch(...args)) {
  async function request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(path, { credentials: 'include', cache: 'no-store' });
    } catch {
      throw new ProductoError('No se pudo conectar con el servidor. Verificá que esté disponible.', 'network');
    }
    if (!response.ok) {
      const message = response.status === 404
        ? 'No se encontró el producto.'
        : 'No se pudieron cargar los productos. Intentá nuevamente más tarde.';
      throw new ProductoError(message, 'http', response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new ProductoError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function getAll(): Promise<ProductType[]> {
    const result = await request('/api/productos');
    if (!isRecord(result) || !Array.isArray(result.data)) {
      throw new ProductoError('El servidor devolvió una respuesta inválida.', 'response');
    }
    // Se ocultan los productos con estado en false (no disponibles en la tienda).
    return result.data
      .filter((p) => !(isRecord(p) && p.estado === false))
      .map(productFrom);
  }

  async function getById(id: number): Promise<ProductType> {
    const result = await request(`/api/productos/${id}`);
    return productFrom(isRecord(result) ? result.data : undefined);
  }

  return { getAll, getById };
}

export const productoService = createProductoService();
