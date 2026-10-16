export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                  // separa la letra de su tilde (é → e + ´)
    .replace(/[\u0300-\u036f]/g, '');  // borra las tildes sueltas
}