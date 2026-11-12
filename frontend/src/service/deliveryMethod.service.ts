import { http } from './http';
import type { DeliveryMethod } from '../type/deliveryMethod';

export async function getDeliveryMethods(): Promise<DeliveryMethod[]> {
  const { data } = await http<{ data: DeliveryMethod[] }>('/metodos-envio');
  return data;
}

