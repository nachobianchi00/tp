import { metodosEnvio } from '../../../mock/metodosEnvio';
import { clienteMock } from '../../../mock/clients';
import type { DeliveryData } from '../../../type/deliveryData';
import type { DeliveryMethod } from '../../../type/deliveryMethod';
import styles from './delivery.module.css';

interface EntregaProps {
  entregaData: DeliveryData;
  onChange: (data: DeliveryData) => void;
}

export default function Entrega({ entregaData, onChange }: EntregaProps) {
  function handleSelectMetodo(metodo: DeliveryMethod) {
    onChange({ ...entregaData, metodoEnvio: metodo });
  }

  function handleObservacionChange(value: string) {
    onChange({ ...entregaData, observacion: value });
  }

  return (
    <section className={styles.container}>
      <h2 className={styles.titulo}>Entrega</h2>

      <div className={styles.opciones}>
        {metodosEnvio.map((metodo) => (
          <button
            key={metodo.id}
            onClick={() => handleSelectMetodo(metodo)}
            className={
              entregaData.metodoEnvio?.id === metodo.id
                ? `${styles.opcionBoton} ${styles.opcionSeleccionada}`
                : styles.opcionBoton
            }
          >
            {metodo.descripcion}
          </button>
        ))}
      </div>

      {entregaData.metodoEnvio?.requiereDireccion && (
        <>
          <p className={styles.envioInfo}>{entregaData.metodoEnvio.observacion}</p>
          <div className={styles.direccionBox}>
            <p className={styles.direccionLabel}>Se enviará a:</p>
            <p className={styles.direccionTexto}>{clienteMock.direccion}</p>
          </div>
        </>
      )}

      {entregaData.metodoEnvio && !entregaData.metodoEnvio.requiereDireccion && (
        <p className={styles.retiroInfo}>
          {entregaData.metodoEnvio.observacion}
        </p>
      )}

      {entregaData.metodoEnvio && (
        <div className={styles.observacionBox}>
          <label className={styles.observacionLabel} htmlFor="observacion">
            Observaciones (opcional)
          </label>
          <textarea
            id="observacion"
            className={styles.observacionInput}
            value={entregaData.observacion}
            onChange={(e) => handleObservacionChange(e.target.value)}
            placeholder="Ej: tocar timbre, horario preferido, etc."
          />
        </div>
      )}
    </section>
  );
}