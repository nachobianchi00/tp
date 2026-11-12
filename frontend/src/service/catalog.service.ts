import { getCategories } from './category.service';
import { getDeliveryMethods } from './deliveryMethod.service';
import { getPayMethods } from './payMethod.service';
import { getProducts } from './product.service';
import type { CategoryType } from '../type/categoryType';

const active = <T extends { estado: boolean }>(items: T[]) => items.filter((i) => i.estado);

// El backend manda la categoría padre como id (o como objeto, o null si no tiene).
interface RawCategory {
  id: number;
  nombre: string;
  categoriaPadre?: number | { id: number } | null;
}

const toCategory = ({ id, nombre, categoriaPadre }: RawCategory): CategoryType => ({
  id,
  nombre,
  padreId: typeof categoriaPadre === 'object' ? (categoriaPadre?.id ?? null) : (categoriaPadre ?? null),
});

export async function loadCatalog() {
  const [products, categories, deliveryMethods, payMethods] = await Promise.all([
    getProducts(),
    getCategories(),
    getDeliveryMethods(),
    getPayMethods(),
  ]);
  return {
    // precio y costo pueden llegar como texto: se pasan a número
    products: active(products).map((p) => ({
      ...p,
      precio: Number(p.precio),
      categorias: p.categorias.map(toCategory),
    })),
    categories: categories.map(toCategory),
    deliveryMethods: active(deliveryMethods).map((m) => ({ ...m, costo: Number(m.costo) })),
    payMethods: active(payMethods),
  };
}