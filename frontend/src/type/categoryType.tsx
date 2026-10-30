export interface CategoryType {
  id: number;
  nombre: string;
 padreId: number | null; // null = categoría principal; si no, id de la categoría de la que es subcategoría
}