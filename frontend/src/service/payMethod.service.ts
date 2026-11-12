import { http } from './http';
import type { PayMethod } from '../type/payMethod';

export async function getPayMethods(): Promise<PayMethod[]> {
  const { data } = await http<{ data: PayMethod[] }>('/metodos-pago');
  return data;
}

export async function createPayMethod(description: string, active: boolean): Promise<PayMethod> {
  const { data } = await http<{ data: PayMethod }>('/metodos-pago', {
    method: 'POST',
    body: JSON.stringify({ descripcion: description, estado: active }),
  });
  return data;
}

export async function updatePayMethod(id: number, description: string, active: boolean): Promise<PayMethod> {
  const { data } = await http<{ data: PayMethod }>(`/metodos-pago/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ descripcion: description, estado: active }),
  });
  return data;
}

export async function deletePayMethod(id: number): Promise<void> {
  await http(`/metodos-pago/${id}`, { method: 'DELETE' });
}