# Moodra $$ — Manual del contador

Todo lo del integrante (ver `MANUAL-INTEGRANTE.md`) más lo que solo hace el contador. Enciende **Más → Modo contador** para ver estas pantallas.

## 1. Principios

- **Partida doble.** Cada captura genera un asiento; los asientos no se editan ni se borran.
- **Anular, no borrar.** Anular crea el asiento espejo. Tú puedes anular cualquier registro sin límite de tiempo.
- **Dinero en centavos enteros.** No hay redondeos escondidos.
- **Un mes cerrado no recibe registros.** Lo capturado con fecha de un mes cerrado entra con la fecha de hoy y queda avisado en el tablero.

## 2. Tablero y reportes (pestaña Reportes)

Con Modo contador se abre directo en los reportes financieros. Elige el periodo arriba (este mes, mes pasado, este año, todo).

- **Tablero:** dinero de la banda, resultado del periodo, por cobrar, por pagar, inventario y Fondo Moodra.
- **Alertas:** existencias bajas o negativas, entregas de efectivo sin confirmar de más de 48 horas, shows sin cerrar y registros hechos en un mes cerrado.
- **Reportes:** resultados (con el mes anterior al lado), balance, flujo de efectivo, balanza, auxiliar por cuenta, saldos por integrante, rentabilidad por show, punto de equilibrio, margen de merch, inventario y liquidación.
- **Cuadres a la vista:** el balance, el flujo y la balanza dicen en pantalla si cuadran. Si alguno sale en rojo, avisa a quien mantiene la app.
- **Descargas:** cada reporte a Excel y PDF, o todos en un Excel.
- **Liquidación:** quién le entrega a quién para dejar los saldos en cero, con el menor número de movimientos.

## 3. Operación del mes (Más → Operación del mes)

### Sueldo del becario

Elige de dónde sale y toca **Pagar**. La tarjeta dice si ya está pagado este mes. El monto se cambia ahí mismo. Si Diego lo paga de su bolsa, se captura como un gasto normal con "Mi dinero".

### Repartos

1. La tarjeta muestra el efectivo disponible, lo que se le debe a integrantes y a proveedores, y lo que queda libre.
2. Escribe el monto a repartir. La vista previa lo divide en partes iguales entre quienes participan (se configura en Usuarios) y suma lo que cada quien pidió "cobrar con el próximo reparto".
3. **Repartir** deja el reparto por pagar. No sale dinero todavía.
4. En **Repartos por pagar**, elige de dónde sale y toca **Pagar** por cada integrante.

Asiento: D Repartos (3.2.x) · H Reparto por pagar (2.4.x). Lo que se le debía y se cobra con el reparto: D Por regresar (2.1.x) · H Reparto por pagar (2.4.x). Al pagar: D 2.4.x · H caja, cuenta o efectivo.

### Arqueo de efectivo

Elige la caja o el efectivo de un integrante, escribe cuánto contaste y la app lo compara contra los libros. Un faltante se carga a Diferencias de caja (7.3); un sobrante se abona. Si cuadra, queda registrado sin asiento.

### Pagos pendientes a proveedores

Aparece cuando hay gastos capturados como "pendiente de pagar". Escribe el monto y de dónde sale.

### Reclasificar saldos

Para cuando alguien decide que lo que puso ya no se le regresa (pasa a aportación), o al revés.

## 4. Asiento manual (Más → Asiento manual)

Para lo que ninguna captura cubre: comisiones del banco, ajustes. Pide motivo, al menos dos renglones y que cargos y abonos sean iguales. Queda marcado como manual y se anula desde Movimientos.

## 5. Cierres (Más → Cierres de mes y de año)

### Cerrar un mes

1. Toca el mes. La lista de revisión dice cuántos shows siguen sin cerrar, cuántas entregas sin confirmar y si hubo arqueos.
2. **Cerrar el mes.** Solo se puede con meses que ya terminaron.
3. Para corregir algo: **Reabrir el mes** con un motivo. Queda en la bitácora.

### Cerrar el año

En enero aparece **Cerrar el año** anterior. Antes hay que cerrar todos sus meses. Pasa el resultado del ejercicio a Resultados acumulados (3.3) con fecha 31 de diciembre. Los reportes de resultados siguen mostrando el año. Un año cerrado ya no se reabre.

## 6. Catálogos (Más → Catálogos)

- **Cuentas:** el código dice de dónde cuelga (6.12 cuelga de 6 y hereda su tipo). Se pueden renombrar y desactivar; no se borran.
- **Categorías:** las de Gasté y Cobré, con su cuenta general y, si aplica, la cuenta cuando es de un show.
- **Tipos de proyecto:** clave de 3 letras; "con shows" hace que sus gastos vayan a costos de show.
- **Contactos:** venues, proveedores y terceros.

Otros catálogos: **Usuarios** (alta, baja, contraseña, rol y si participa en repartos), **Productos y precios** y **Boleteras**.

## 7. Merch

- **Entró merch:** compra o saldo inicial, con piezas y costo. El costo es promedio ponderado.
- **Conteo:** corrige existencias; la diferencia va a Mermas (7.2).
- El costo de lo vendido se registra solo en cada venta.

## 8. Shows y boleteras

- Cada show se cierra con lo que pagaron según su trato; lo pendiente queda en **Nos deben**.
- La liquidación de una boletera la registras tú con **Ya llegó**.

## 9. Transporte entre integrantes

Los viajes en autos de integrantes no mueven dinero de la banda. Cada viaje es un gasto cubierto por la aportación de cada integrante, y las diferencias quedan en cuentas "Transporte" (1.6.x) que siempre suman cero. Ajusta el precio del litro y el desgaste en **Transporte → Tarifas**.

## 10. Notificaciones y respaldos

- Las notificaciones se activan por dispositivo en **Más → Notificaciones**.
- El respaldo semanal y los avisos de cada noche corren en GitHub. Ver `RESPALDOS.md`.

## 11. Qué revisar cada mes

1. Tablero sin alertas pendientes.
2. Shows del mes cerrados y entregas confirmadas.
3. Arqueo de la caja y del efectivo de cada quien.
4. Sueldo del becario pagado.
5. Balance, flujo y balanza en verde.
6. Descargar "todos en Excel" y guardarlo.
7. Cerrar el mes.
