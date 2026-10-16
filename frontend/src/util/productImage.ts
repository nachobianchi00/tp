// El back no guarda imágenes: se genera un placeholder con el nombre del producto.
export function productImage(nombre: string): string {
  return `https://placehold.co/300x300?text=${encodeURIComponent(nombre)}`;
}
