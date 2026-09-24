import { Entity, Property, ManyToOne, OneToMany, ManyToMany  } from '@mikro-orm/decorators/legacy'
import { Collection } from '@mikro-orm/core'
import { Producto } from '../producto/producto.entity.js'
import { BaseEntity } from '../shared/db/baseEntity.entity.js'

@Entity()
export class Categoria extends BaseEntity {
  @Property({ unique: true })
  nombre!: string
   
  @ManyToOne(() => Categoria, { nullable: true })
  categoriaPadre?: Categoria;

  @OneToMany(() => Categoria, (categoria) => categoria.categoriaPadre)
  subcategorias = new Collection<Categoria>(this);

  @ManyToMany(() => Producto, producto => producto.categorias)
  productos = new Collection<Producto>(this)  
}