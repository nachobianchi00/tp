import type { CategoryType } from "./categoryType";

export interface ProductType {
  id: number;
  nombre: string;
  descripcion: string;
  imagenUrl?: string | null;
  precio: number;
  cantidad: number; 
  estado: boolean;
  categorias: CategoryType[];
}
