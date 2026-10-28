export function productImage(nombre: string): string {
  return `https://placehold.co/300x300?text=${encodeURIComponent(nombre)}`;
}
