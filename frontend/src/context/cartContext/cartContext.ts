import { createContext } from 'react';
import type { ProductType } from '../../type/productType';
import type { CartItem } from '../../type/cartItem';

export interface CartContextType {
  items: CartItem[];
  addToCart: (product: ProductType, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);