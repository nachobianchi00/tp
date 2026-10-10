import type { ProductType } from "../type/productType";

export const products: ProductType[] = [
  {
    id: 1,
    name: "Mani",
    price: 1500,
    stock: 5,
    image: 'https://placehold.co/300x300?text=mani',
    category: {id:1 , name: "Almacen"}

  },
 {
    id: 2,
    name: "Doritos",
    price: 3000,
    stock: 6,
    image: 'https://placehold.co/300x300?text=doritos',
    category: {id:1 , name: "Almacen"}

  },
  {
    id: 3,
    name: "Pan",
    price: 500,
    stock: 8,
    image: 'https://placehold.co/300x300?text=pan',
    category: {id:2 , name: "Panaderia"}

  },
 {
    id: 4,
    name: "Fideos",
    price: 3000,
    stock: 3,
    image: 'https://placehold.co/300x300?text=fideos',
    category: {id:1 , name: "Almacen"}

  },
  {
    id: 5,
    name: "Banana",
    price: 2000,
    stock: 4,
    image: 'https://placehold.co/300x300?text=banana',
    category: {id:3 , name: "Verdurelia"}

  },
 {
    id: 6,
    name: "Manzana",
    price: 3000,
    stock: 10,
    image: 'https://placehold.co/300x300?text=manzana',
    category: {id:3 , name: "Verdurelia"}

  },
]