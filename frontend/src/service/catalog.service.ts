import { http } from './http';
import type { ProductType } from '../type/productType';
import type { CategoryType } from '../type/categoryType';
import type { DeliveryMethod } from '../type/deliveryMethod';
import type { PayMethod } from '../type/payMethod';

const list = <T>(path: string) => http<{ data: T[] }>(path).then((r) => r.data);
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
    list<ProductType>('/productos'),
    list<RawCategory>('/categorias'),
    list<DeliveryMethod>('/metodos-envio'),
    list<PayMethod>('/metodos-pago'),
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