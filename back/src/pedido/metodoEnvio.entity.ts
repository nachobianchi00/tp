import { Entity, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

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
}
