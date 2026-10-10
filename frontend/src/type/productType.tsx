import type { CategoryType } from "./categoryType";

export interface ProductType {
  id: number;
  name: string;
  price: number;
  stock: number;
  image: string;
  category: CategoryType;
}