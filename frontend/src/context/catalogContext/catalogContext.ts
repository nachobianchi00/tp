import { createContext } from 'react';
import type { ProductType } from '../../type/productType';
import type { CategoryType } from '../../type/categoryType';
import type { DeliveryMethod } from '../../type/deliveryMethod';
import type { PayMethod } from '../../type/payMethod';

export interface CatalogContextValue {
  products: ProductType[];
  categories: CategoryType[];
  deliveryMethods: DeliveryMethod[];
  payMethods: PayMethod[];
  loading: boolean;
  error: boolean;
}

export const CatalogContext = createContext<CatalogContextValue | null>(null);