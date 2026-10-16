// src/page/checkout/component/pay.tsx
import { useCatalog } from '../../../context/catalogContext/useCatalog';
import type { PayData } from '../../../type/payData';
import type { PayMethod } from '../../../type/payMethod';
import styles from './pay.module.css';

interface PayProps {
  payData: PayData;
  onChange: (data: PayData) => void;
}

export default function Pay({ payData, onChange }: PayProps) {
  const { payMethods } = useCatalog();

  function handleSelectMethod(method: PayMethod) {
    onChange({ metodoPago: method });
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
              payData.metodoPago?.id === method.id
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