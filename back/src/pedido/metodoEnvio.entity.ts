import { Entity, Property, ManyToOne, OneToMany } from '@mikro-orm/decorators/legacy'
import { Collection } from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'
import { Pedido } from './pedido.entity.js'

@Entity()
export class MetodoEnvio extends BaseEntity {
  @Property({ nullable: false })
  descripcion!: string

  @Property({ nullable: false })
  costo!: string


  @Property({ default: true })
  direccion!: boolean

  @Property({ nullable: true })
  tiempoEstimado?: string
    
  @Property({ default: true })
  estado!: boolean

  @Property({ default: true })
  activo!: boolean

  @Property({ nullable: true })
  observacion?: string

  @OneToMany(() => Pedido, pedido => pedido.metodoEnvio ) // esta realcion apunta a pedido y en el objeto pedido podemos encontrar el metodo de envio que se utilizo
  pedidos = new Collection<Pedido>(this)
}
