import { Entity, Property, OneToMany,  } from '@mikro-orm/decorators/legacy'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

@Entity()
export class MetodoPago extends BaseEntity {
  @Property({ nullable: false })
  nombre!: string

  @Property({ type: 'text', nullable: true })
  instructions?: string

  @Property({ default: true })
  estado!: boolean

  @Property({ nullable: true })
  descripcion?: string
}
id
descripcion
instrucciones
estado
tipo
porcentajeRecargo