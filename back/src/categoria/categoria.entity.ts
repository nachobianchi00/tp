import { Entity, Property, ManyToOne, OneToMany, ManyToMany  } from '@mikro-orm/decorators/legacy'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

@Entity()
export class Categoria extends BaseEntity {
  @Property({ unique: true })
  nombre!: string
}