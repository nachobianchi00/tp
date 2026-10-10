var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Property, Enum, OneToOne } from '@mikro-orm/decorators/legacy';
import { Pedido } from '../pedido/pedido.entity.js';
import { BaseEntity } from '../shared/db/baseEntity.entity.js';
export var EstadoPago;
(function (EstadoPago) {
    EstadoPago["PENDIENTE"] = "pending";
    EstadoPago["APROBADO"] = "approved";
    EstadoPago["RECHAZADO"] = "rejected";
    EstadoPago["EN_PROCESO"] = "in_process";
    EstadoPago["CANCELADO"] = "cancelled";
})(EstadoPago || (EstadoPago = {}));
let Pago = class Pago extends BaseEntity {
    pedido; // a qué pedido corresponde este pago
    preferenceId; // el "preference_id" que te devuelve MP al crear la preferencia
    mercadoPagoPaymentId; // el "payment_id" real, recién existe cuando el usuario paga
    externalReference; // el id de TU pedido, para poder cruzar la notificación con tu BD
    estado;
    monto;
    statusDetail; // detalle extra que manda MP
    fechaCreacion;
    fechaAprobacion;
};
__decorate([
    OneToOne(() => Pedido),
    __metadata("design:type", Object)
], Pago.prototype, "pedido", void 0);
__decorate([
    Property(),
    __metadata("design:type", String)
], Pago.prototype, "preferenceId", void 0);
__decorate([
    Property({ nullable: true }),
    __metadata("design:type", String)
], Pago.prototype, "mercadoPagoPaymentId", void 0);
__decorate([
    Property(),
    __metadata("design:type", String)
], Pago.prototype, "externalReference", void 0);
__decorate([
    Enum({ items: () => EstadoPago, default: EstadoPago.PENDIENTE }),
    __metadata("design:type", String)
], Pago.prototype, "estado", void 0);
__decorate([
    Property({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Pago.prototype, "monto", void 0);
__decorate([
    Property({ nullable: true }),
    __metadata("design:type", String)
], Pago.prototype, "statusDetail", void 0);
__decorate([
    Property({ onCreate: () => new Date() }),
    __metadata("design:type", Date)
], Pago.prototype, "fechaCreacion", void 0);
__decorate([
    Property({ nullable: true }),
    __metadata("design:type", Date)
], Pago.prototype, "fechaAprobacion", void 0);
Pago = __decorate([
    Entity()
], Pago);
export { Pago };
