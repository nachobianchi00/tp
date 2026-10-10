import type { ProductType } from './productType';

export interface CartItem {
  product: ProductType;
  quantity: number;
}