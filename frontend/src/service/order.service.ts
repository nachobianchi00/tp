import { http } from './http';
import type { CartItem } from '../type/cartItem';
import type { DeliveryData } from '../type/deliveryData';
import type { PayData } from '../type/payData';
import type { PedidoType } from '../type/pedidoType';

export async function createOrder(items: CartItem[], delivery: DeliveryData, pay: PayData) {
  const res = await http<{ data: { id: number } }>('/pedidos', {
    method: 'POST',
    body: JSON.stringify({
      metodoPago: pay.metodoPago?.id,
      metodoEnvio: delivery.metodoEnvio?.id,
      observacion: delivery.observacion, 
      detallePedido: items.map((i) => ({ producto: i.product.id, cantidad: i.quantity })),
    }),
  });
  return res.data.id;
}

export async function getOrder(id: number): Promise<PedidoType> {
  const { data } = await http<{ data: PedidoType }>(`/pedidos/${id}`);

  return {
    ...data,
    total: Number(data.total),
    metodoEnvio: { ...data.metodoEnvio, costo: Number(data.metodoEnvio.costo) },
    detallePedido: data.detallePedido.map((d) => ({ ...d, precioUnitario: Number(d.precioUnitario) })),
  };
}

export async function getMyOrders(): Promise<PedidoType[]> {
  const { data } = await http<{ data: PedidoType[] }>('/pedidos');
  return data
    .map((p) => ({ ...p, total: Number(p.total) }))
    .sort((a, b) => b.id - a.id); // los más nuevos primero
}

export async function cancelOrder(id: number): Promise<void> {
  await http(`/pedidos/${id}/cancelar`, { method: 'POST' });
}