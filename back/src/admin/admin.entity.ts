import {
  Entity,
  Property,
  ManyToMany,
  Cascade,
  ManyToOne,
  Rel,
} from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'



@Entity()
export class Character extends BaseEntity {
  @Property({ nullable: false })
  nombre!: string

  @Property({ nullable: false })
  dni!: number

  @Property({ nullable: false })
  apellido!: string

  @Property({ nullable: false })
  mail!: string

  @Property({ nullable: false })
  password!: string

}

