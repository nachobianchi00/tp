import { Entity, Property, ManyToOne, Enum, ManyToMany, OneToMany  } from '@mikro-orm/decorators/legacy'
import { Cascade, Collection } from '@mikro-orm/core';
import { BaseEntity } from '../shared/db/baseEntity.entity.js'
import { DetallePedido } from './detallePedido.entity.js';
import { Cliente } from '../cliente/cliente.entity.js';
import { MetodoPago } from './metodoPago.entity.js';

export enum EstadoPedido {
  PENDIENTE = 'pendiente',
  ENVIADO = 'enviado',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
}

@Entity()
export class Pedido extends BaseEntity {

  @Enum({ items: () => EstadoPedido, default: EstadoPedido.PENDIENTE })
  estado!: EstadoPedido;

  @Property({ onCreate: () => new Date() })
  fechaCreacion!: Date; // generado automáticamente

  @Property({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number;

  @ManyToOne(() => Cliente)
  cliente!: Cliente; 

  @OneToMany(() => DetallePedido, (detalle) => detalle.pedido, {
    cascade: [Cascade.ALL],
  })
  detallePedido = new Collection<DetallePedido>(this);

  @ManyToOne(() => MetodoPago)
  metodoPago!: MetodoPago;

}