import type { DeliveryMethod } from './deliveryMethod';

export interface DeliveryData {
  metodoEnvio: DeliveryMethod | null;
  observacion: string;
}