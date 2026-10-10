// src/page/checkout/component/pay.tsx
import { payMethods } from '../../../mock/payMethods';
import type { PayData } from '../../../type/payData';
import type { PayMethodType } from '../../../type/payMethod';
import styles from './pay.module.css';

interface PayProps {
  payData: PayData;
  onChange: (data: PayData) => void;
}

export default function Pay({ payData, onChange }: PayProps) {
  function handleSelectMethod(method: PayMethodType) {
    onChange({ payMethod: method });
  }

  return (
    <section className={styles.container}>
      <h2 className={styles.titulo}>Pago</h2>

      <div className={styles.opciones}>
        {payMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => handleSelectMethod(method)}
            className={
              payData.payMethod?.id === method.id
                ? `${styles.opcionBoton} ${styles.opcionSeleccionada}`
                : styles.opcionBoton
            }
          >
            {method.descripcion}
          </button>
        ))}
      </div>
    </section>
  );
}