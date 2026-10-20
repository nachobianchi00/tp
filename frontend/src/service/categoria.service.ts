import type { CategoryType } from '../type/categoryType';

export class CategoriaError extends Error {
  readonly status: number | undefined;
  readonly kind: 'http' | 'network' | 'response';

  constructor(message: string, kind: CategoriaError['kind'], status?: number) {
    super(message);
    this.name = 'CategoriaError';
    this.kind = kind;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El backend devuelve también subcategorías y productos; la UI solo necesita id y nombre. */
function categoryFrom(value: unknown): CategoryType {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.nombre !== 'string') {
    throw new CategoriaError('El servidor devolvió una categoría inválida.', 'response');
  }
  return { id: value.id, name: value.nombre };
}

export function createCategoriaService(fetcher: typeof fetch = (...args) => fetch(...args)) {
  async function request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(path, { credentials: 'include', cache: 'no-store' });
    } catch {
      throw new CategoriaError('No se pudo conectar con el servidor. Verificá que esté disponible.', 'network');
    }
    if (!response.ok) {
      throw new CategoriaError('No se pudieron cargar las categorías. Intentá nuevamente más tarde.', 'http', response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new CategoriaError('El servidor devolvió una respuesta inválida.', 'response');
    }
  }

  async function getAll(): Promise<CategoryType[]> {
    const result = await request('/api/categorias');
    if (!isRecord(result) || !Array.isArray(result.data)) {
      throw new CategoriaError('El servidor devolvió una respuesta inválida.', 'response');
    }
    return result.data.map(categoryFrom);
  }

  return { getAll };
}

export const categoriaService = createCategoriaService();