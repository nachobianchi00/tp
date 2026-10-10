var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Categoria_1;
import { Entity, Property, ManyToOne, OneToMany, ManyToMany } from '@mikro-orm/decorators/legacy';
import { Collection } from '@mikro-orm/core';
import { Producto } from '../producto/producto.entity.js';
import { BaseEntity } from '../shared/db/baseEntity.entity.js';
let Categoria = Categoria_1 = class Categoria extends BaseEntity {
    nombre;
    categoriaPadre;
    subcategorias = new Collection(this);
    productos = new Collection(this);
};
__decorate([
    Property({ unique: true }),
    __metadata("design:type", String)
], Categoria.prototype, "nombre", void 0);
__decorate([
    ManyToOne(() => Categoria_1, { nullable: true }),
    __metadata("design:type", Categoria_1)
], Categoria.prototype, "categoriaPadre", void 0);
__decorate([
    OneToMany(() => Categoria_1, (categoria) => categoria.categoriaPadre),
    __metadata("design:type", Object)
], Categoria.prototype, "subcategorias", void 0);
__decorate([
    ManyToMany(() => Producto, (producto) => producto.categorias),
    __metadata("design:type", Object)
], Categoria.prototype, "productos", void 0);
Categoria = Categoria_1 = __decorate([
    Entity()
], Categoria);
export { Categoria };
