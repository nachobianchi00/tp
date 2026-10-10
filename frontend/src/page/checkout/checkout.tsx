import { useState } from 'react';
import Entrega from './component/delivery';
import Pay from './component/pay';
import Resumen from './component/resume';
import type { DeliveryData } from '../../type/deliveryData';
import type { PayData } from '../../type/payData';
import styles from './checkout.module.css';

export default function Checkout() {
  const [entregaData, setEntregaData] = useState<DeliveryData>({
    metodoEnvio: null,
    observacion: '',
  });

  const [payData, setPayData] = useState<PayData>({
    payMethod: null,
  });

  return (
    <div className={styles.container}>
      <h1 className={styles.titulo}>Checkout</h1>

      <div className={styles.contenido}>
        <div className={styles.columnaIzquierda}>
          <Entrega entregaData={entregaData} onChange={setEntregaData} />
          <Pay payData={payData} onChange={setPayData} />
        </div>

        <div className={styles.columnaDerecha}>
          <Resumen entregaData={entregaData} payData={payData} />
        </div>
      </div>
    </div>
  );
}