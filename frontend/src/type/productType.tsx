import type { CategoryType } from "./categoryType";

export interface ProductType {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  cantidad: number; 
  estado: boolean;
  categorias: CategoryType[];
}
