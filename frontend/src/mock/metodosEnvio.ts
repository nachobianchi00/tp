import type { DeliveryMethod } from '../type/deliveryMethod';

export const metodosEnvio: DeliveryMethod[] = [
  {
    id: 1,
    description: 'Envío a domicilio',
    price: 4500,
    requiresAddress: true,
    time: '24-48hs',
    state: true,
    comment: 'Envío a domicilio de lunes a viernes de 9 a 18hs',
  },
  {
    id: 2,
    description: 'Retiro en sucursal',
    price: 0,
    requiresAddress: false,
    time: 'Inmediato',
    state: true,
    comment: 'Retiro en sucursal de lunes a viernes de 9 a 18hs',
  },
];