import type { PayMethodType } from '../type/payMethod';

export const payMethods: PayMethodType[] = [
  { id: 1, descripcion: 'Efectivo', estado: true },
  { id: 2, descripcion: 'Transferencia bancaria', estado: true },
  { id: 3, descripcion: 'Mercado Pago', estado: true },
];