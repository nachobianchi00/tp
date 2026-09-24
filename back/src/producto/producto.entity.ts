import { Categoria } from "../categoria/categoria.entity.js";
import { Entity, Property, ManyToMany, OneToMany } from '@mikro-orm/decorators/legacy'
import { Collection } from '@mikro-orm/core'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'


@Entity()
export class Producto extends BaseEntity {
  @Property({ nullable: false })
  nombre!: string

  @Property({ nullable: false })
  descripcion!: string

  @Property({ nullable: false })
  precio!: number

  @Property({ nullable: false })
  cantidad!: number

  @Property({ nullable: false })
  estado!: boolean 

  @ManyToMany(() => Categoria, categoria => categoria.productos)
  categorias = new Collection<Categoria>(this)
}
