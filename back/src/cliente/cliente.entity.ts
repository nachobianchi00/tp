import { Entity, Property, OneToMany } from '@mikro-orm/decorators/legacy'
import { Collection } from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'
import { Pedido } from '../pedido/pedido.entity.js'

@Entity()
export class Cliente extends BaseEntity {
  @Property({ nullable: false })
  nombre!: string

  @Property({ nullable: false })
  apellido!: string

  @Property({ unique: true })
  dni!: number

  @Property({ nullable: false })
  direccion!: string

  @Property({ nullable: false })
  telefono!: string

  @Property({ unique: true })
  mail!: string

  @Property({ nullable: false })
  password!: string

  @OneToMany(() => Pedido, pedido => pedido.cliente ) // esta realcion apunta a pedido y en el objeto pedido podemos encontrar el cliente que hizo el pedido
  pedidos = new Collection<Pedido>(this)

}
