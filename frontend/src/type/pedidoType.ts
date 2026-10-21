import type { DeliveryMethod } from './deliveryMethod';
import type { PayMethod } from './payMethod';

export type PedidoEstado = 'pendiente' | 'confirmado' | 'enviado' | 'entregado' | 'cancelado';

export interface DetallePedidoType {
  id: number;
  cantidad: number;
  precioUnitario: number;
  producto: number;
}

export interface PedidoType {
  id: number;
  estado: PedidoEstado;
  fechaCreacion: string;
  total: number;
  observacion?: string | null;
  metodoEnvio: DeliveryMethod;
  metodoPago: PayMethod;
  detallePedido: DetallePedidoType[];
}