import type { PayMethod } from './payMethod';

export interface PayData {
  metodoPago: PayMethod | null;
}
