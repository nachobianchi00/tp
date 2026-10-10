import { Entity, Property } from '@mikro-orm/decorators/legacy'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'



@Entity()
export class Admin extends BaseEntity {
  @Property({ nullable: false })
  nombre!: string

  @Property({ unique: true })
  dni!: number

  @Property({ nullable: false })
  apellido!: string

  @Property({ unique: true })
  mail!: string

  @Property({ nullable: false })
  password!: string

}

