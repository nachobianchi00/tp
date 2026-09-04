import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/decorators/legacy';
import { Pedido } from '../pedido/pedido.entity.js';
import { Producto } from '../producto/producto.entity.js';
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

@Entity()
export class DetallePedido  extends BaseEntity {
  @Property()
  cantidad!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  precioUnitario!: number;

  @ManyToOne(() => Pedido)
  pedido!: Pedido;

  @ManyToOne(() => Producto)
  producto!: Producto;
}