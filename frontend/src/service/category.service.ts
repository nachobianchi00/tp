import { http } from './http';
import type { CategoryType } from '../type/categoryType';

export async function getCategories(): Promise<CategoryType[]> {
  const response = await http<{ data: CategoryType[] }>('/categorias');
  return response.data;
}

export async function createCategory(
  name: string,
  parentId: number | null
): Promise<CategoryType> {
  const response = await http<{ data: CategoryType }>('/categorias', {
    method: 'POST',
    body: JSON.stringify({ nombre: name, categoriaPadre: parentId }),
  });

  return response.data;
}

export async function updateCategory(
  id: number,
  name: string,
  parentId: number | null
): Promise<CategoryType> {
  const response = await http<{ data: CategoryType }>(`/categorias/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ nombre: name, categoriaPadre: parentId }),
  });

  return response.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await http(`/categorias/${id}`, { method: 'DELETE' });
}