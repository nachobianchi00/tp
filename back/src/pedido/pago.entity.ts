import { Entity, Property, Enum, OneToOne } from '@mikro-orm/decorators/legacy';
import { Pedido } from '../pedido/pedido.entity.js';
import { BaseEntity } from '../shared/db/baseEntity.entity.js';

export enum EstadoPago {
  PENDIENTE = 'pending',
  APROBADO = 'approved',
  RECHAZADO = 'rejected',
  EN_PROCESO = 'in_process',
  CANCELADO = 'cancelled',
}

@Entity()
export class Pago extends BaseEntity {
  
  @OneToOne(() => Pedido)
  pedido!: Pedido; // a qué pedido corresponde este pago

  @Property()
  preferenceId!: string; // el "preference_id" que te devuelve MP al crear la preferencia

  @Property({ nullable: true })
  mercadoPagoPaymentId?: string; // el "payment_id" real, recién existe cuando el usuario paga

  @Property()
  externalReference!: string; // el id de TU pedido, para poder cruzar la notificación con tu BD

  @Enum({ items: () => EstadoPago, default: EstadoPago.PENDIENTE })
  estado!: EstadoPago;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  monto!: number;

  @Property({ nullable: true })
  statusDetail?: string; // detalle extra que manda MP

  @Property({ onCreate: () => new Date() })
  fechaCreacion!: Date;

  @Property({ nullable: true })
  fechaAprobacion?: Date;
}