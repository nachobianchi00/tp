// La función usa la foto guardada cuando está disponible y conserva la imagen de ejemplo para los demás productos.
export function productImage(name: string, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl;

  return `https://placehold.co/300x300?text=${encodeURIComponent(name)}`;
}

  

