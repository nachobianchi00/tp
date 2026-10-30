import type { DeliveryMethod } from './deliveryMethod';
import type { PayMethod } from './payMethod';
import type { ClientProfile } from './clientType';

export type PedidoEstado = 'pendiente' | 'confirmado' | 'entregado' | 'cancelado';

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
  cliente: ClientProfile;
  metodoEnvio: DeliveryMethod;
  metodoPago: PayMethod;
  detallePedido: DetallePedidoType[];
}