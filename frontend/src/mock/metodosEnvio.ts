import type { DeliveryMethod } from '../type/deliveryMethod';

export const metodosEnvio: DeliveryMethod[] = [
  {
    id: 1,
    descripcion: 'Envío a domicilio',
    costo: 4500,
    requiereDireccion: true,
    tiempoEstimado: '24-48hs',
    estado: true,
    observacion: 'Envío a domicilio de lunes a viernes de 9 a 18hs',
  },
  {
    id: 2,
    descripcion: 'Retiro en sucursal',
    costo: 0,
    requiereDireccion: false,
    tiempoEstimado: 'Inmediato',
    estado: true,
    observacion: 'Retiro en sucursal de lunes a viernes de 9 a 18hs',
  },
];
