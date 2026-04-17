# Propuesta TP DSW

## Grupo
### Integrantes
* 47658 - Bianchi Paredes, Ignacio
* 48257 - Martin Ignacio
* 51400 - Porta Lautaro
* 48756 - Gambotto Leonel

### Repositorios
* [frontend app](http://hyperlinkToGihubOrGitlab)
* [backend app](http://hyperlinkToGihubOrGitlab)
*Nota*: si utiliza un monorepo indicar un solo link con fullstack app.

## Tema
### Descripción
*El negocio trata de un supermercado que realiza pedidos por medio de su **E-Commerce**. A través de este sistema web permite gestionar sus pedidos, clientes y productos con su correspondiente categoría*


### Modelo
<img width="811" height="855" alt="MD TP" src="https://github.com/user-attachments/assets/e4720c5b-6fcb-4ff2-9466-3a14fb03b5e8" />

## Alcance Funcional 

### Alcance Mínimo

Regularidad:
|Req|Detalle|
|:-|:-|
|CRUD simple|1. CRUD Cliente <br>2. CRUD Admin<br>3. CRUD Categoría<br>4. CRUD Metodo de Pago<br>|
|CRUD dependiente|1. CRUD Pedido {depende de} CRUD Cliente<br>2. CRUD Producto {depende de} CRUD Categoría|
|Listado<br>+<br>detalle| 1. Listado de pedidos pendientes filtrado por estados, muestra pedido, id cliente y estado de pedido <br> 2.  Listado de productos filtrado por categorías, muestra producto con sus atributos incluida la cantidad como prioridad|
|CUU/Epic|1. Armar y finalizar pedido <br>2. Gestionar y cambiar estado del pedido<br>|


Adicionales para Aprobación
|Req|Detalle|
|:-|:-|
|CRUD |1. CRUD Cliente <br>2. CRUD Admin<br>3. CRUD Categoría<br>4. CRUD Metodo de Pago<br>5. CRUD Producto<br>6. CRUD Pedido<br>7. CRUD Forma de envio<br>8. CRUD Detalle del pedido <br>|
|CUU/Epic|1. Crear y registrar pedido <br>2. Gestionar y cambiar estado del pedido<br>3. Cliente revisa historial de compras pudiendo repetir el pedido<br>4. Admin gestiona el catalogo<br>|


### Alcance Adicional Voluntario
*(Pendiente)*


