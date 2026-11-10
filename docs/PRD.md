# PRD — Moodra $$

Sistema contable de gira y operación para Moodra
Versión 1.0 · Noviembre 2026 · Dueño del producto: Diego (contador/admin)

---

## 1. Contexto y objetivo

Moodra es una banda independiente de rock psicodélico instrumental de Ciudad Satélite, Edo. Méx. Hoy el dinero de la banda se mueve en efectivo y transferencias entre integrantes durante shows y giras, y el registro depende de la memoria de cada quien.

**Objetivo:** que cada integrante registre en segundos lo que gasta, cobra o vende, incluso sin señal, y que el contador tenga en tiempo real una contabilidad de partida doble completa: estados financieros, saldos por integrante, inventario de merch y rentabilidad por show, gira y proyecto.

**Criterio de éxito:** al terminar una gira, la liquidación ("quién trae qué, a quién se le debe qué, cuánto dejó la gira") sale en un clic y sin discusiones.

**Alcance contable:** gestión interna. La banda no está constituida legalmente. No hay CFDI ni IVA. Todo es en MXN. El periodo es el año calendario con cierre mensual.

## 2. Usuarios y roles

| Usuario | Rol | Participa en reparto |
|---|---|---|
| Diego (batería) | `contador` + integrante | Sí |
| Pepe (guitarra) | `integrante` | Sí |
| Ram (bajo) | `integrante` | Sí |
| Uli (guitarra) | `integrante` | Sí |
| Becario (nombre por definir) | `integrante` | No (recibe sueldo) |

- **Acceso.** Usuario y contraseña. Supabase Auth usa email internamente; el usuario escribe solo su username, que se mapea a `username@caja.moodra.mx`. Sin confirmación de email, sin registro público. Solo el contador crea, desactiva y resetea contraseñas.
- **Visibilidad.** Todos ven todo: movimientos, saldos y reportes. Es una banda, no una empresa.
- **Aprobaciones.** No se requieren. Todo lo capturado cuenta de inmediato.
- **Correcciones.** Un integrante puede anular sus propios registros durante 24 h (con motivo). Después, solo el contador. Anular genera reversa; nunca se borra.
- **Cambio de vista.** El contador puede alternar entre "Modo banda" (la misma vista de integrante) y "Modo contador".

## 3. Principios de producto

1. **Rockstar-proof.** Si un integrante necesita pensar en contabilidad, el diseño falló. La vista de integrante habla en verbos: *Gasté, Cobré, Vendí, Pasé efectivo*.
2. **Primero se guarda, luego se sincroniza.** Funciona en carretera, en un sótano o en otro país sin datos.
3. **Contexto automático.** Si hay un show o gira activa, todo lo capturado se etiqueta solo. El usuario puede cambiarlo, pero el default es correcto el 90% del tiempo.
4. **Nada se borra.** Todo es trazable: quién, cuándo y desde qué dispositivo.
5. **Partida doble invisible.** Cada acción genera su asiento automáticamente según el mapa de §5.3.
6. **Ligero y fluido.** Carga inicial < 200 KB gzip de JS en la ruta de inicio, transiciones a 60 fps y UI optimista.

## 4. Módulos funcionales

### 4.1 Inicio (integrante)

- **Chip de contexto arriba:** "🎸 Show: Foro Indie Rocks · 14 nov" o "🚐 Gira: Bajío 2026". Tocarlo permite cambiarlo.
- **Tarjeta de saldo personal**, con lenguaje humano:
  - "Traes **$1,250** de la banda" (efectivo en su poder)
  - "Te debemos **$380**" (por regresar)
  - Si ambos aplican, se muestran netos y desglosados.
- **Tarjeta de la banda:** "Esta gira vamos **+$4,200**" o "Este mes: entró $X / salió $Y".
- **Cuatro botones grandes:**
  - 💸 **Gasté**
  - 💵 **Cobré**
  - 👕 **Vendí merch** (abre el POS)
  - 🤝 **Pasé efectivo**
- **Campo "Dime qué pasó"** (texto o dictado del teclado): ver §4.12.
- **Feed en vivo** de los últimos movimientos de toda la banda (Realtime), con avatar y emoji.
- **Indicador de sync:** "Afinando… 3 pendientes" o "Todo al día ✓".
- **Pendientes del usuario:** entregas de efectivo por confirmar, cierre de show pendiente.

### 4.2 Gasté

Flujo:

1. **Monto.** Teclado numérico propio. Opción 📷 de foto del ticket, que llena todo con IA.
2. **Categoría.** Chips con emoji.
3. **¿Con qué pagaste?**
   - "Efectivo de la banda que traigo" (default si trae saldo)
   - "Mi dinero"
   - "Cuenta de la banda (transferencia)"
   - "Quedó pendiente de pagar"
4. **Si fue "Mi dinero", ¿qué hacemos?**
   - "Regrésenmelo"
   - "Descuéntalo del próximo reparto"
   - "Es aportación, no me lo regresen"
5. **Opcionales** (colapsados): descripción, pagado a (tercero o proveedor), proyecto/show (ya viene del contexto), fecha (default: ahora).
6. **Confirmación** en lenguaje humano: "Gastaste $850 en ⛽ Transporte para el show de Querétaro, con tu dinero. Te lo regresamos." → Guardar.

**Categorías default** (editables; el contador puede crear, renombrar, cambiar emoji, reordenar, desactivar y mapear cuentas):

| Emoji | Categoría | Cuenta si hay show/gira | Cuenta general |
|---|---|---|---|
| ⛽ | Transporte | 5.3.01 | 6.99 |
| 🍔 | Comida | 5.3.04 | 6.99 |
| 🏨 | Hospedaje | 5.3.03 | 6.99 |
| 🎸 | Equipo | 5.3.05 | 6.01 |
| 🎛️ | Producción | 5.3.07 | 6.02 |
| 📣 | Promo | 6.05 | 6.05 |
| 👕 | Merch (compra) | → flujo de compra de inventario §4.8 | |
| 🧾 | Otro | 5.3.99 | 6.99 |

**Extras visibles en "Más"** (también editables): 🙋 Staff/terceros (5.3.06), 🛣️ Casetas/estacionamiento (5.3.02), 🎬 Video/foto (6.03), 🎨 Diseño (6.04), 💻 Software (6.07), 🎟️ Inscripción convocatoria/festival (6.08), 🎓 Sueldo becario (6.09, solo visible para el contador).

Cada categoría tiene `cuenta_show` y `cuenta_general`. El sistema elige según haya o no show/proyecto de tipo show/gira en el contexto.

### 4.3 Cobré

Sirve para dinero que entra y no es venta de merch.

Pregunta inicial: "¿De qué fue?"
- 🎤 **Pago de un show:** abre el cierre de show (§4.7) si hay show en contexto.
- 🎵 **Música (DistroKid / Bandcamp)**
- 🤝 **Patrocinio / apoyo**
- 🎬 **Sync / licencia**
- 🧾 **Otro**

Después: monto → ¿dónde quedó? ("Lo traigo yo en efectivo" / "Llegó a la cuenta de la banda" / "Lo guardé en la caja") → confirmar.

### 4.4 Vendí merch (POS)

- **Grid de productos** con foto/emoji, precio y stock. Tocar un producto con variantes (talla/color) abre un selector rápido.
- **Carrito** con +/−. Un toggle por línea "🎁 Regalo/cortesía" pone precio $0 y lo registra como merch regalado (§5.3).
- **Método de pago:** 💵 Efectivo (default) / 📲 Transferencia.
- **¿Quién cobró?** Default: el usuario actual.
- **Canal:** Show (default si hay show en contexto) / Bandcamp / Tienda web (futuro) / Otro.
- **Botón gigante "Cobrar $X".** Animación de éxito. La venta queda lista para la siguiente en < 1 s.
- **Offline total.** Precios y stock se toman de la caché. El stock puede quedar negativo offline y se alerta al contador.
- **Resumen de la noche:** "Hoy vendimos 14 piezas · $4,350 · margen $2,610".

### 4.5 Pasé efectivo (entregas)

- **Origen:** el efectivo que trae el usuario.
- **Destino:**
  - otro integrante
  - "Caja Moodra" (efectivo guardado de la banda; el custodio es el contador)
  - "Lo deposité en la cuenta de la banda"
- **Flujo con confirmación.**
  - Entre personas, el receptor recibe una push: "Uli dice que te pasó $2,000. ¿Lo recibiste?" → ✅ Sí / ❌ No.
  - El asiento se postea **al confirmar**. Mientras tanto, ambos ven "pendiente de confirmar".
  - Si se rechaza, no se postea nada y se avisa al emisor y al contador.
- **Depósito al banco.** Lo confirma el contador al verlo en el estado de cuenta (misma mecánica). Puede adjuntar foto del comprobante.
- **Arqueo (solo contador).** "Contar efectivo de X": captura lo contado, el sistema compara contra libros y registra la diferencia (§5.3).

### 4.6 Proyectos, giras y shows

**Proyectos.** Catálogo de tipos, editable por el contador:

| Clave | Tipo |
|---|---|
| OPE | Operación general (default sin proyecto) |
| GIR | Gira |
| SHW | Show suelto |
| GRA | Grabación (EP / álbum) |
| LAN | Lanzamiento de single |
| VID | Videoclip |
| SES | Live session / streaming |
| FOT | Sesión de fotos / arte |
| MER | Producción de merch (drop) |
| CON | Convocatoria / beca / apoyo |
| INT | Festival o viaje internacional |
| EQP | Inversión en equipo |

Cada proyecto tiene: clave autogenerada (ej. `GIR-2026-03`), nombre, tipo, fechas, presupuesto opcional, estado (planeado / activo / cerrado) y notas.

**Shows.** Cada show tiene:
- proyecto opcional (una gira agrupa shows)
- venue (catálogo de contactos), ciudad y fecha
- **tipo de deal:** `fee_fijo`, `porcentaje_taquilla`, `fee_mas_porcentaje`, `boletaje_propio` (boletos vendidos por la banda vía plataforma o en puerta) o `sin_pago`
- campos del deal: fee, %, precio de boleto, plataforma
- **ingreso esperado**, calculado
- estado: programado → realizado → cerrado / cancelado

**Contexto activo.** Cualquier integrante puede poner "Estamos en: [show/gira]". Se sincroniza a todos por Realtime. A medianoche del día siguiente al show se sugiere volver a "Operación general".

### 4.7 Cierre de show y taquilla

Es un asistente que aparece como pendiente después de la fecha del show. Lo puede hacer cualquiera y toma ~10 segundos.

1. "¿Cuánto les pagaron?". Precargado con lo esperado según el deal:
   - **% de taquilla:** ¿cuántos boletos o cuánto fue la taquilla bruta? → el sistema calcula su parte.
   - **Boletaje propio por plataforma:** boletos vendidos × precio, comisión según la plataforma configurada y fecha esperada de liquidación.
   - **Sin pago:** se cierra el show con ingreso $0 (los costos sí cuentan).
2. "¿Dónde quedó el dinero?" → efectivo de [integrante] (lo usual en % de taquilla, que suele liquidarse esa noche) / transferencia a la cuenta / pendiente de cobro (queda por cobrar al venue o a la boletera).
3. Pago a terceros del show, opcional: ingeniero, roadie, VJ, fotógrafo, músico invitado → genera gastos 5.3.06 con su tercero.
4. **Resultado del show** en pantalla: ingresos − costos directos − costo de merch + utilidad de merch = **"Este show dejó +$X"**.

**Plataformas de boletaje** (catálogo, contador): nombre, % comisión, comisión fija por boleto, quién absorbe la comisión (`publico` | `banda`) y días a liquidación. Seed: "Passline" y "Plataforma propia (amigo)", con comisión 0% y 0 días como placeholder **por configurar**. Hoy no hay datos de la comisión ni del plazo de Passline, y no se sabe si la plataforma del amigo tiene API o reportes.

Cuando llega la liquidación de la boletera, el contador registra "Llegó liquidación de Passline" y se salda el por cobrar.

### 4.8 Merch e inventario

- **Productos y variantes:** categoría (Playeras, Vinilos/CD, Stickers, Pines, Canas, Otros), nombre, foto, variantes (talla/color) con SKU, precio de venta, costo promedio y stock.
- **Ubicación:** v1 una sola, "Bodega Apnea". El modelo soporta varias ubicaciones a futuro.
- **Movimientos de inventario:**
  - **Compra/entrada:** cantidad × costo unitario, pagado con efectivo de banda, cuenta, dinero de un integrante o por pagar. Recalcula el costo promedio.
  - **Venta** (desde el POS).
  - **Regalo/cortesía** (prensa, venues, amigos): se registra siempre, a costo.
  - **Merma / faltante** (dañado, perdido, robado).
  - **Ajuste por conteo físico:** el contador captura lo contado y el sistema registra la diferencia.
- **Alertas:** stock bajo (umbral por variante) y stock negativo.
- **Inventario inicial:** el sistema arranca en ceros. La primera carga de merch se registra como compra o entrada normal.

### 4.9 Fondo: aportaciones, préstamos y reembolsos

- **"Puse dinero"** (cualquier integrante; caso típico: Diego pone ~$7,000 al mes para el sueldo del becario).
  - Monto → ¿a dónde? (cuenta / caja / se lo di a alguien) → **¿Se te regresa?**
    - "Sí, es préstamo" → queda como saldo a favor del integrante (2.1).
    - "No, es aportación" → patrimonio (3.1).
- **Reclasificar (contador).** Convierte un saldo a favor en aportación, total o parcial ("al final ya no se regresa"). Lo inverso también es posible.
- **Regresar dinero.** Paga un saldo a favor desde caja, cuenta o efectivo de otro integrante.
- **Gasto recurrente: sueldo del becario.** Plantilla mensual que el contador confirma con un toque ("Pagar sueldo becario $7,000 desde la cuenta de la banda"). Si Diego lo paga directo de su bolsa, se registra como gasto "Mi dinero" y elige préstamo o aportación.

### 4.10 Repartos

Hoy no ha habido utilidades. El módulo existe para cuando las haya.

- **Asistente "Repartir"** (contador), disparado manualmente:
  1. Elige el alcance: periodo, gira o proyecto (informativo para mostrar de dónde salió la utilidad).
  2. El sistema muestra el **efectivo disponible** (caja + cuenta + efectivo en poder de integrantes), las obligaciones (saldos por regresar, proveedores por pagar) y una **reserva sugerida** editable.
  3. Monto a repartir → **partes iguales** entre los usuarios con `participa_reparto = true` (hoy 4). El becario no participa.
  4. Por integrante, descuenta lo marcado "Descuéntalo del próximo reparto" y muestra el neto.
  5. Confirma → genera "repartos por pagar". Cada pago posterior (transferencia o efectivo) los salda.

### 4.11 Ingresos de música

Se registran desde "Cobré → 🎵 Música": DistroKid (streaming) y Bandcamp (descargas digitales). Las ventas de merch físico en Bandcamp van por el POS con canal "Bandcamp" para que descuenten inventario. El dinero llega a la cuenta de la banda (a nombre de Diego). Las comisiones de plataforma, si se conocen, van a 5.2.

### 4.12 Captura inteligente (IA)

**Foto de ticket**
1. 📷 en "Gasté".
2. La foto se comprime y sube.
3. La Edge Function `parse-receipt` llama a Claude (`claude-haiku-5-5`) con la imagen y la lista de categorías.
4. Devuelve JSON `{monto_cents, fecha, comercio, categoria_id, descripcion, confianza}`.
5. El formulario se prellena y **el usuario siempre confirma**.
6. Offline: la foto queda en cola; el usuario puede capturar el monto a mano y la IA solo complementa al reconectar.

**"Dime qué pasó"** (texto o dictado del teclado del celular, sin costo de transcripción)
1. El usuario escribe o dicta: "850 de gasolina en Querétaro con mi lana".
2. La Edge Function `parse-text` devuelve una **propuesta de evento**: tipo, monto, categoría, método de pago y contexto.
3. Se muestra como tarjeta editable → Confirmar.

Sirve también para ventas ("vendí 2 playeras negras M en efectivo") y entregas ("le pasé 2 mil a Ram").

**Reglas comunes**
- Salida validada con Zod en servidor.
- Si `confianza` < 0.7, los campos dudosos se resaltan.
- Nunca se postea sin confirmación humana.

**Costo estimado.** ~2,000 tokens de entrada y ~200 de salida por ticket, a $0.10/$0.50 USD por millón. Unos $0.0003 USD por ticket, < $1 USD al mes.

### 4.13 Vista contador

- **Dashboard en tiempo real:**
  - posición de efectivo (caja, cuenta, en poder de cada integrante)
  - saldos por integrante
  - por cobrar (venues y boleteras con antigüedad)
  - por pagar
  - resultado del mes y del año
  - top shows por utilidad
  - inventario valuado
  - alertas: stock negativo, entregas sin confirmar > 48 h, shows sin cerrar, diferencias de caja
- **Libro diario** con filtros (fecha, cuenta, integrante, proyecto, show, tipo de evento, anulados). Cada asiento enlaza a su evento, su foto y su bitácora.
- **Auxiliares por cuenta** y **balanza de comprobación**.
- **Catálogos editables:** cuentas, categorías, tipos de proyecto, plataformas de boletaje, productos, contactos (venues, proveedores, terceros).
- **Asiento manual** (solo contador): para casos raros, con validación de cuadre y motivo obligatorio.
- **Cierre de mes:**
  1. checklist (shows cerrados, entregas confirmadas, arqueos, conteo de inventario opcional)
  2. cerrar periodo
  3. reabrir solo con motivo y queda en bitácora
- **Cierre de año:** traspasa el resultado del ejercicio a resultados acumulados.
- **Usuarios:** alta, baja, reset de contraseña, `participa_reparto`, rol.

### 4.14 Reportes

Todos con filtros de periodo y dimensiones, y exportables a **Excel y PDF** con la identidad Moodra.

1. **Estado de resultados:** por periodo, por show, por gira/proyecto, comparativo mes vs mes.
2. **Balance general.**
3. **Flujo de efectivo**, método directo desde las cuentas 1.1 y 1.2, por categoría de movimiento.
4. **Saldos por integrante:** efectivo en su poder, por regresar, aportaciones acumuladas y repartos recibidos.
5. **Liquidación de gira:** resultado de la gira más un "quién le debe a quién" para dejar todos los saldos en cero (estilo Splitwise, con el mínimo de transferencias).
6. **Inventario valuado** por variante y **rotación**.
7. **Margen por producto de merch.**
8. **Break-even por show:** costos directos del show / ingreso neto por boleto = boletos necesarios para no perder, comparado contra lo real.
9. **Rentabilidad por show:** ranking de venues/ciudades por utilidad total, incluyendo merch.
10. **Libro diario, auxiliares y balanza** (contables, para el contador).

**Dashboards de integrante:** versión simplificada con 3–4 gráficas (resultado de la gira, ventas de merch por noche, gastos por categoría) en lenguaje humano.

### 4.15 Notificaciones (solo push, Web Push con VAPID)

| Evento | Para quién |
|---|---|
| Te pasaron efectivo, confirma | receptor |
| Tu entrega fue confirmada / rechazada | emisor (+ contador si se rechaza) |
| Show de ayer sin cerrar | integrantes del contexto + contador |
| Resumen nocturno de gira ("Hoy: +$3,200, 11 piezas vendidas") | todos, si hay gira activa |
| Traes > $5,000 de la banda por > 3 días (umbral configurable) | el integrante |
| Stock bajo o negativo | contador |
| Entregas sin confirmar > 48 h | contador |

Cada usuario puede silenciar tipos de notificación.

### 4.16 Respaldos y keep-alive

- **GitHub Actions diario:** consulta liviana a Supabase para evitar la pausa del plan gratis por 7 días de inactividad.
- **GitHub Actions semanal:**
  - `pg_dump` completo más un export de Excel (diario, balanza, saldos e inventario)
  - subida a una carpeta de Google Drive (vía rclone con cuenta de servicio)
  - se conservan 12 semanas
- Es el **único respaldo descargable** en el plan gratuito, así que es obligatorio.

## 5. Modelo contable

### 5.1 Catálogo de cuentas (seed)

Las subcuentas por integrante (marcadas `[por integrante]`) se crean automáticamente al dar de alta un usuario.

```
1 ACTIVO
 1.1 Efectivo
   1.1.01 Caja Moodra
   1.1.1x Efectivo en poder de [por integrante]
 1.2 Bancos
   1.2.01 Cuenta Moodra (a nombre de Diego, exclusiva de la banda)
 1.3 Por cobrar
   1.3.01 Venues
   1.3.02 Boleteras            (subcuenta por plataforma: Passline, Plataforma amigo)
   1.3.99 Otros por cobrar
 1.4 Inventario de merch
   1.4.01 Playeras · 1.4.02 Vinilos y CD · 1.4.03 Stickers
   1.4.04 Pines · 1.4.05 Canas · 1.4.99 Otros
 1.5 Anticipos a proveedores
2 PASIVO
 2.1 Por regresar a integrantes  [por integrante]   (préstamos y gastos pagados con su dinero)
 2.2 Proveedores y terceros por pagar
 2.3 Cobros anticipados de shows
 2.4 Repartos por pagar          [por integrante]
3 FONDO MOODRA
 3.1 Aportaciones                [por integrante]
 3.2 Repartos                    [por integrante]
 3.3 Resultados acumulados
 3.4 Resultado del ejercicio
4 INGRESOS
 4.1 Shows
   4.1.01 Fee fijo · 4.1.02 % de taquilla · 4.1.03 Boletaje propio
 4.2 Merch
   4.2.01 Playeras · 4.2.02 Vinilos y CD · 4.2.03 Stickers
   4.2.04 Pines · 4.2.05 Canas · 4.2.99 Otros
 4.3 Música
   4.3.01 Streaming (DistroKid) · 4.3.02 Bandcamp (digital)
 4.4 Patrocinios y apoyos
 4.5 Sync y licencias
 4.9 Otros ingresos
5 COSTOS DIRECTOS
 5.1 Costo de venta de merch
 5.2 Comisiones (boleteras y plataformas)
 5.3 Costos de show
   5.3.01 Transporte y gasolina · 5.3.02 Casetas y estacionamiento
   5.3.03 Hospedaje · 5.3.04 Comida y viáticos
   5.3.05 Backline y renta de equipo · 5.3.06 Ingeniero, staff y terceros
   5.3.07 Producción en vivo (visuales, luces) · 5.3.99 Otros costos de show
6 GASTOS DE OPERACIÓN
 6.01 Equipo menor y mantenimiento (cuerdas, baquetas, parches)
 6.02 Producción musical (grabación, mezcla, master)
 6.03 Video y fotografía · 6.04 Diseño y arte
 6.05 Promoción y publicidad · 6.06 Distribución digital
 6.07 Software y suscripciones · 6.08 Inscripciones a convocatorias y festivales
 6.09 Sueldo del becario · 6.10 Trámites y administración
 6.99 Otros gastos
7 OTROS
 7.1 Merch regalado y cortesías
 7.2 Mermas y faltantes de inventario
 7.3 Diferencias de caja
 7.4 Comisiones bancarias
```

**Sin activos fijos en v1:** el equipo pertenece a Apnea. Si en el futuro se agregan, irían en 1.6 Equipo, con depreciación en 6.11.

El contador puede agregar cuentas. No se pueden borrar cuentas con movimientos (solo desactivarlas).

### 5.2 Medios de pago → cuenta

| En la app | Cuenta |
|---|---|
| Efectivo de la banda que traigo | 1.1.1x del usuario |
| Caja Moodra | 1.1.01 |
| Cuenta de la banda | 1.2.01 |
| Mi dinero | 2.1.x del usuario (préstamo/reembolso o compensar en reparto) o 3.1.x (aportación) |
| Quedó pendiente de pagar | 2.2 |

### 5.3 Mapa de asientos por evento

Notación: **D** = debe, **H** = haber. "Pagador" = la cuenta de §5.2. Todas las líneas llevan las dimensiones (integrante, proyecto, show, variante) cuando aplican.

| Evento | Asiento |
|---|---|
| **Gasto** | D cuenta de la categoría (show o general) · H pagador |
| Gasto "Mi dinero → regrésenmelo / compensar" | D gasto · H 2.1.x (con `settlement_pref` guardado en el evento) |
| Gasto "Mi dinero → aportación" | D gasto · H 3.1.x |
| **Venta merch** (por línea) | D 1.1.1x cobrador o 1.2.01 · H 4.2.y (precio) **y** D 5.1 · H 1.4.y (cantidad × costo promedio) |
| Línea de venta marcada regalo | D 7.1 · H 1.4.y (a costo); sin ingreso |
| **Compra de merch** | D 1.4.y · H pagador; recalcula el costo promedio |
| Regalo fuera de venta | D 7.1 · H 1.4.y |
| Merma / faltante | D 7.2 · H 1.4.y |
| Ajuste por conteo (+) | D 1.4.y · H 7.2 (recuperación) |
| **Cierre show, fee fijo** cobrado | D destino (1.1.1x / 1.2.01) · H 4.1.01 |
| Cierre show, fee pendiente | D 1.3.01 · H 4.1.01 |
| Cierre show, % taquilla | D destino o 1.3.01 · H 4.1.02 |
| Cierre show, boletaje propio vía plataforma (comisión a cargo de la banda) | D 1.3.02.p (neto) + D 5.2 (comisión) · H 4.1.03 (bruto) |
| Cierre show, boletaje propio (comisión a cargo del público) | D 1.3.02.p · H 4.1.03 (neto = bruto que recibe la banda) |
| Boletaje en puerta cobrado por la banda | D 1.1.1x · H 4.1.03 |
| Cobro anticipado de show | D destino · H 2.3; al cerrar el show: D 2.3 · H 4.1.0x |
| Llega la liquidación de la boletera / el pago del venue | D 1.2.01 · H 1.3.02.p / 1.3.01 |
| **Ingreso de música, patrocinio, sync u otro** | D destino · H 4.3.0x / 4.4 / 4.5 / 4.9 |
| **Entrega de efectivo** X → Y (al confirmar) | D 1.1.1y · H 1.1.1x |
| Entrega X → Caja | D 1.1.01 · H 1.1.1x |
| Depósito al banco (al confirmar) | D 1.2.01 · H 1.1.1x o 1.1.01 |
| **Puse dinero, préstamo** | D destino · H 2.1.x |
| **Puse dinero, aportación** | D destino · H 3.1.x |
| Reclasificar préstamo → aportación | D 2.1.x · H 3.1.x (y viceversa) |
| **Regresar dinero** a integrante | D 2.1.x · H origen |
| Pago a proveedor pendiente | D 2.2 · H origen |
| **Reparto** (asignación) | D 3.2.x · H 2.4.x (bruto por integrante); compensación: D 2.4.x · H 2.1.x |
| Pago de reparto | D 2.4.x · H origen |
| **Arqueo**, faltante | D 7.3 · H 1.1.1x / 1.1.01 |
| Arqueo, sobrante | D 1.1.1x / 1.1.01 · H 7.3 |
| Comisión bancaria | D 7.4 · H 1.2.01 |
| **Anulación** de cualquier evento | asiento espejo (D↔H) con `reverses_entry_id`; repone o revierte inventario y costo |
| Cierre de ejercicio | Cuentas 4–7 contra 3.4; luego 3.4 → 3.3 |

**Nota sobre la anulación de ventas.** Al anular una venta, el inventario se repone al costo unitario registrado en la venta original, no al promedio actual.

## 6. Modelo de datos (Postgres)

Convenciones:
- todas las tablas con `id uuid` (v7), `created_at` y `created_by`
- dinero en `*_cents bigint`
- enums de Postgres
- RLS habilitado en todas

**Identidad y configuración**
- `profiles`: id (= auth.uid), username unique, display_name, color, emoji, role (`integrante` | `contador`), participa_reparto, activo
- `app_settings`: contexto activo (project_id, show_id), umbrales de alertas, zona horaria `America/Mexico_City`
- `push_subscriptions`: user_id, endpoint, keys, tipos silenciados

**Contabilidad**
- `accounts`: code unique, name, type (activo/pasivo/patrimonio/ingreso/costo/gasto/otro), nature (deudora/acreedora), parent_id, member_id, is_postable, active
- `periods`: year, month, status (abierto/cerrado), closed_by, closed_at, reopen_reason
- `journal_entries`: number (secuencial), date, period_id, description, source_event_id, reverses_entry_id, is_manual
- `journal_lines`: entry_id, account_id, debit_cents, credit_cents (exactamente uno > 0), member_id, project_id, show_id, variant_id, memo

**Catálogos**
- `categories`: name, emoji, kind (gasto/ingreso), account_show_id, account_general_id, sort, visible_to (todos/contador), active
- `project_types`: code, name, emoji
- `projects`: code, type_id, name, start/end, budget_cents, status, notes
- `contacts`: name, kind (venue/proveedor/tercero/boletera/otro), city, phone, notes
- `ticket_platforms`: contact_id, commission_pct (numeric), commission_fixed_cents, bearer (publico/banda), settlement_days
- `shows`: project_id, venue_id, date, city, deal_type, fee_cents, percentage, ticket_price_cents, platform_id, expected_income_cents, status
- `products`: category (enum de merch), name, photo_path, inventory_account_id, revenue_account_id, active
- `product_variants`: product_id, sku, label, price_cents, avg_cost_cents, stock_qty, low_stock_threshold
- `locations`: name (seed: "Bodega Apnea")
- `recurring_templates`: name, event_type, payload, cadence (mensual), next_date

**Eventos** (lo que captura el usuario)
- `events`: client_id unique, type, captured_at, device_info, project_id, show_id, status (registrado / pendiente_confirmacion / rechazado / anulado), journal_entry_id, void_entry_id, voided_by, void_reason
- Detalle tipado 1:1 con `events`:
  - `expense_details`: category_id, amount_cents, paid_with, payer_member_id, settlement_pref, payee_contact_id, description, receipt_path, ai_raw jsonb
  - `sale_details` + `sale_lines`: variant_id, qty, unit_price_cents, unit_cost_cents, is_gift; con channel, payment_method, collected_by
  - `income_details`: kind, account_id, amount_cents, destination
  - `show_settlements`: show_id, tickets_sold, gross_cents, commission_cents, net_cents, fee_cents, destination, pending
  - `cash_transfers`: from_kind/from_member, to_kind/to_member, amount_cents, confirmed_by, confirmed_at
  - `fund_movements`: kind (prestamo/aportacion/reclasificacion/regreso), member_id, amount_cents, destination/origin
  - `inventory_movements`: variant_id, location_id, qty (±), unit_cost_cents, kind (compra/venta/regalo/merma/ajuste/anulacion)
  - `cash_counts`: holder, counted_cents, book_cents, diff_cents
  - `distributions` + `distribution_lines`: member_id, gross_cents, compensation_cents, net_cents, paid_cents
- `audit_log`: actor, action, entity, entity_id, payload jsonb, device, at

**Vistas**
- `v_account_balances` (por periodo)
- `v_member_balances` (efectivo en poder, por regresar, aportaciones, repartos)
- `v_show_pnl`
- `v_project_pnl`
- `v_inventory` (valuado)
- `v_trial_balance`
- `v_cash_position`
- `v_pending_items`

**RPCs**
- `submit_event(client_id, type, payload, captured_at)`: valida, inserta el evento y su detalle, postea, escribe bitácora; idempotente
- `confirm_cash_transfer(event_id, accept bool)`
- `void_event(event_id, reason)`: aplica la regla de 24 h para el autor
- `close_period(year, month)` / `reopen_period(year, month, reason)`
- `preview_distribution(params)` / `run_distribution(params)`
- `post_manual_entry(lines, reason)`: solo contador

**Edge Functions**
- `admin-users` (crear/desactivar/resetear)
- `parse-receipt`
- `parse-text`
- `send-push`
- `nightly-tour-summary` (programada con pg_cron)
- `keepalive` (opcional; el ping también puede ir directo desde GitHub Actions)

## 7. Seguridad y permisos

| Acción | Integrante | Contador |
|---|---|---|
| Ver todo (movimientos, saldos, reportes) | ✅ | ✅ |
| Capturar gastos, cobros, ventas, entregas, "puse dinero" | ✅ | ✅ |
| Cerrar show, cambiar contexto activo | ✅ | ✅ |
| Anular registro propio < 24 h | ✅ | ✅ |
| Anular cualquier registro | ❌ | ✅ |
| Catálogos, productos, precios, categorías | ❌ | ✅ |
| Reclasificar, arqueos, ajustes, asientos manuales | ❌ | ✅ |
| Repartos, cierre/reapertura de periodo | ❌ | ✅ |
| Usuarios | ❌ | ✅ |

Los permisos se implementan con RLS más chequeo de rol dentro de cada RPC (`SECURITY DEFINER` con `auth.uid()`). Las pruebas pgTAP cubren cada fila de esta tabla.

## 8. Offline y tiempo real

- **Service worker (Workbox):** precache del app shell y fuentes; runtime cache de fotos de productos.
- **Dexie:**
  - `outbox` (eventos pendientes, con reintentos y backoff exponencial)
  - `cache` de catálogos (productos, precios, categorías, shows, contexto activo, usuarios)
  - última foto de saldos
- **Disparadores de sync:** al abrir la app, `online`, `visibilitychange` y Background Sync donde exista (Android). En iOS se sincroniza al abrir y al recuperar foco.
- **Realtime:** suscripción a `events` y `app_settings`. Al recibir cambios se invalidan las queries de saldos y feed. Los dashboards se actualizan solos.
- **Conflictos:** no hay ediciones, solo inserciones idempotentes, así que no hay conflictos de escritura. Los únicos efectos colaterales son el stock negativo (alerta) y el periodo cerrado. Si `captured_at` cae en un periodo cerrado, el evento entra al periodo abierto con nota y alerta al contador.
- **Requisito iOS:** la app debe instalarse en la pantalla de inicio para tener push y almacenamiento persistente. El onboarding lo guía con capturas.

## 9. Integraciones

**v1**
- Claude API (IA de captura).
- Web Push.
- Google Drive (respaldo, vía GitHub Actions).

**Preparado, pero no en v1**
- Endpoint genérico `webhook-ingest` con firma HMAC, para futuras integraciones: tienda en moodra.mx con PayPal, terminal de cobro (Mercado Pago/Stripe) y la plataforma del amigo si expone webhooks.
- Passline: sin API pública conocida, así que en v1 se usa el cierre de taquilla manual (§4.7).
- **CFDI (largo plazo):** el modelo deja `contacts` con campos fiscales opcionales y `events` con `cfdi_uuid` nullable para conectar un PAC después.

## 10. Diseño visual

La base es la identidad de **moodra.mx**:

- **Fondo** casi negro `#0b0a0c`.
- **Logo** wordmark en blanco.
- **Estética** minimalista e inmersiva.
- **Secciones numeradas** en estilo editorial: "01 — Gastos", "02 — Merch".
- **Detalles musicales:** el loader de la web dice "Afinando 0%", así que aquí el sync dice "Afinando… 3 pendientes".

**Tokens.** Pídele a Diego la ruta o el repo de la web de moodra.mx y extrae de ahí tipografías, color de acento y radios a `/src/design/tokens.ts`. Si no está disponible, usa placeholders neutros (sans-serif del sistema, acento blanco) y deja el pendiente en `DECISIONES.md`.

**Componentes clave:**
- teclado numérico de monto (cifra enorme, tipografía tabular)
- chips de categoría
- tarjetas de saldo
- grid POS
- bottom sheets para flujos
- toasts con "Deshacer"
- skeletons
- haptics (`navigator.vibrate`) en confirmaciones

**Semántica de color:**
- entradas: verde suave
- salidas: neutro (no rojo agresivo)
- pendientes: ámbar
- anulados: tachado gris

**Accesibilidad:** contraste AA, tamaños mínimos de 16 px en inputs (evita el zoom en iOS) y soporte de `prefers-reduced-motion`.

## 11. No funcionales

- **Costo:** $0/mes en el plan gratuito de Supabase (500 MB de BD, 1 GB de storage, pausa tras 7 días sin actividad, mitigada con keep-alive) y Netlify gratis. Claude API < $1 USD/mes. Si un día la pausa o los límites estorban, se sube a Supabase Pro (~$25 USD/mes) sin cambiar código.
- **Storage:** fotos comprimidas (~200 KB), unas 5,000 fotos caben en 1 GB. Alerta al 80%.
- **Rendimiento:** registrar un gasto es instantáneo localmente (< 100 ms de feedback). Sync en < 2 s con red normal.
- **Zona horaria:** todo en `America/Mexico_City`. Fechas contables tipo `date`; timestamps `timestamptz`.
- **Idioma:** español (México). Formato `$1,234.56`.
- **Auditoría:** el diario nunca se modifica; se puede reconstruir el estado completo desde `events` + `journal_*`.

## 12. Fuera de alcance v1 / futuro

- CFDI y facturación.
- IVA.
- Multimoneda (por ejemplo, para un viaje a NXNE se registra convertido a MXN, con nota).
- Activos fijos.
- Tienda en línea integrada.
- Integración automática con boleteras.
- Apps nativas en tiendas.
- Múltiples ubicaciones de inventario.
- Becas con comprobación (el tipo de proyecto CON ya permite presupuesto contra real).

## 13. Supuestos por confirmar con Diego

1. Comisión, quién la absorbe y días de liquidación de Passline (hoy son placeholder configurable).
2. Si la plataforma del amigo tiene API o exporta reportes.
3. Repo o archivos de la web moodra.mx, para extraer los tokens de diseño.
4. Nombre del becario.
5. Regla de anulación del autor: 24 h (ajustable en `app_settings`).
6. Umbral de alerta de "traes mucho efectivo": $5,000 por más de 3 días (ajustable).
