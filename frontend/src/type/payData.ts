import type { PayMethodType } from './payMethod';

export interface PayData {
  payMethod: PayMethodType | null;
}