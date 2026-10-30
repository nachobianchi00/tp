export interface CategoryType {
  id: number;
  nombre: string;
  padreId: number | null; // tienda: id de la categoría madre (null = categoría principal)
  categoriaPadre?: number | null; // panel admin: id de la madre tal como lo manda el backend
}