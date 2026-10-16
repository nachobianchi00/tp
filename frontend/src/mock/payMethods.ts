import type { PayMethod } from '../type/payMethod';

export const payMethods: PayMethod[] = [
  { id: 1, descripcion: 'Efectivo', estado: true },
  { id: 2, descripcion: 'Transferencia bancaria', estado: true },
  { id: 3, descripcion: 'Mercado Pago', estado: true },
];