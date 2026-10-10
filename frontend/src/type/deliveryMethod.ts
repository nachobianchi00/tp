export interface DeliveryMethod {
  id: number;
  description: string;
  price: number;
  requiresAddress: boolean;
  time?: string;
  state: boolean;
  comment?: string;
}