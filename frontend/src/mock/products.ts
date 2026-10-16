import type { ProductType } from '../type/productType';
import { categories } from './categories';

const [almacen, panaderia, bebidas, lacteos] = categories;

export const products: ProductType[] = [
  { id: 1, nombre: 'Mani', descripcion: 'Maní tostado salado', precio: 1500, cantidad: 5, estado: true, categorias: [almacen] },
  { id: 2, nombre: 'Doritos', descripcion: 'Snack de maíz sabor queso', precio: 3000, cantidad: 6, estado: true, categorias: [almacen] },
  { id: 3, nombre: 'Pan', descripcion: 'Pan francés por kilo', precio: 500, cantidad: 8, estado: true, categorias: [panaderia] },
  { id: 4, nombre: 'Fideos', descripcion: 'Fideos secos 500g', precio: 3000, cantidad: 3, estado: true, categorias: [almacen] },
  { id: 5, nombre: 'Gaseosa', descripcion: 'Gaseosa cola 1,5L', precio: 2000, cantidad: 4, estado: true, categorias: [bebidas] },
  { id: 6, nombre: 'Leche', descripcion: 'Leche entera 1L', precio: 1800, cantidad: 10, estado: true, categorias: [lacteos] },
];
