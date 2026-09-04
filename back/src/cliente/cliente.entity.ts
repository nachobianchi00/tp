import {
  Entity,
  Property,
  OneToMany,
} from '@mikro-orm/decorators/legacy'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

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

}
