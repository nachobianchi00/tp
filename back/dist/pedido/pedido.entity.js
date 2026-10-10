var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Property, ManyToOne, Enum, OneToMany, OneToOne } from '@mikro-orm/decorators/legacy';
import { Cascade, Collection } from '@mikro-orm/core';
import { BaseEntity } from '../shared/db/baseEntity.entity.js';
import { DetallePedido } from './detallePedido.entity.js';
import { Cliente } from '../cliente/cliente.entity.js';
import { MetodoPago } from './metodoPago.entity.js';
import { MetodoEnvio } from './metodoEnvio.entity.js';
import { Pago } from './pago.entity.js';
export var EstadoPedido;
(function (EstadoPedido) {
    EstadoPedido["PENDIENTE"] = "pendiente";
    EstadoPedido["CONFIRMADO"] = "confirmado";
    EstadoPedido["ENVIADO"] = "enviado";
    EstadoPedido["ENTREGADO"] = "entregado";
    EstadoPedido["CANCELADO"] = "cancelado";
})(EstadoPedido || (EstadoPedido = {}));
let Pedido = class Pedido extends BaseEntity {
    estado;
    fechaCreacion; // generado automáticamente
    total;
    cliente;
    detallePedido = new Collection(this);
    metodoPago;
    metodoEnvio;
    pago;
};
__decorate([
    Enum({ items: () => EstadoPedido, default: EstadoPedido.PENDIENTE }),
    __metadata("design:type", String)
], Pedido.prototype, "estado", void 0);
__decorate([
    Property({ onCreate: () => new Date() }),
    __metadata("design:type", Date)
], Pedido.prototype, "fechaCreacion", void 0);
__decorate([
    Property({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Pedido.prototype, "total", void 0);
__decorate([
    ManyToOne(() => Cliente),
    __metadata("design:type", Object)
], Pedido.prototype, "cliente", void 0);
__decorate([
    OneToMany(() => DetallePedido, (detalle) => detalle.pedido, {
        cascade: [Cascade.ALL],
    }),
    __metadata("design:type", Object)
], Pedido.prototype, "detallePedido", void 0);
__decorate([
    ManyToOne(() => MetodoPago),
    __metadata("design:type", Object)
], Pedido.prototype, "metodoPago", void 0);
__decorate([
    ManyToOne(() => MetodoEnvio),
    __metadata("design:type", Object)
], Pedido.prototype, "metodoEnvio", void 0);
__decorate([
    OneToOne(() => Pago, { nullable: true, mappedBy: 'pedido' }),
    __metadata("design:type", Object)
], Pedido.prototype, "pago", void 0);
Pedido = __decorate([
    Entity()
], Pedido);
export { Pedido };
