export interface DeliveryMethod {
  id: number;
  descripcion: string;
  costo: number;
  requiereDireccion: boolean;
  tiempoEstimado?: string;
  estado: boolean;
  observacion?: string;
}
