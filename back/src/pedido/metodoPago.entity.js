var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Property, OneToMany } from '@mikro-orm/decorators/legacy';
import { Collection } from '@mikro-orm/core';
import { BaseEntity } from '../shared/db/baseEntity.entity.js';
import { Pedido } from './pedido.entity.js';
let MetodoPago = class MetodoPago extends BaseEntity {
    descripcion;
    estado;
    pedidos = new Collection(this);
};
__decorate([
    Property({ nullable: false }),
    __metadata("design:type", String)
], MetodoPago.prototype, "descripcion", void 0);
__decorate([
    Property({ default: true }),
    __metadata("design:type", Boolean)
], MetodoPago.prototype, "estado", void 0);
__decorate([
    OneToMany(() => Pedido, pedido => pedido.metodoPago) // esta realcion apunta a pedido y en el objeto pedido podemos encontrar el metodo de pago que se utilizo
    ,
    __metadata("design:type", Object)
], MetodoPago.prototype, "pedidos", void 0);
MetodoPago = __decorate([
    Entity()
], MetodoPago);
export { MetodoPago };
