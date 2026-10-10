import { Entity, Property, OneToMany  } from '@mikro-orm/decorators/legacy'
import { Collection } from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'
import { Pedido } from './pedido.entity.js'

@Entity()
export class MetodoPago extends BaseEntity {
  @Property({ nullable: false })
  descripcion!: string

  @Property({ default: true })
  estado!: boolean

 @OneToMany(() => Pedido, pedido => pedido.metodoPago ) // esta realcion apunta a pedido y en el objeto pedido podemos encontrar el metodo de pago que se utilizo
  pedidos = new Collection<Pedido>(this)

}
