import { http } from './http';
import type { ProductType } from '../type/productType';

interface ProductInput {
  name: string;
  description: string;
  price: number;
  stock: number;
  active: boolean;
  categoryIds: number[];
}

function serializeProduct(product: ProductInput): string {
  return JSON.stringify({
    nombre: product.name,
    descripcion: product.description,
    precio: product.price,
    cantidad: product.stock,
    estado: product.active,
    categorias: product.categoryIds,
  });
}

export async function getProducts(): Promise<ProductType[]> {
  const { data } = await http<{ data: ProductType[] }>('/productos');
  return data;
}

export async function createProduct(product: ProductInput): Promise<ProductType> {
  const { data } = await http<{ data: ProductType }>('/productos', {
    method: 'POST',
    body: serializeProduct(product),
  });
  return data;
}

export async function updateProduct(id: number, product: ProductInput): Promise<ProductType> {
  const { data } = await http<{ data: ProductType }>(`/productos/${id}`, {
    method: 'PUT',
    body: serializeProduct(product),
  });
  return data;
}

export async function deleteProduct(id: number): Promise<void> {
  await http(`/productos/${id}`, { method: 'DELETE' });
}