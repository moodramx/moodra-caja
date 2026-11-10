# PROGRESO — Moodra $$

## Fase 2 — Merch, POS e inventario · 2026-11-10 · **publicada, en revisión de Diego**

Está en `main` y en la base de desarrollo de la nube. Falta probarla en un celular real.

### Hecho y verificado en la compu

- **Catálogo** (contador): productos con variantes (talla, color), precio y aviso de stock bajo. Más → Modo contador → Productos y precios.
- **Inventario a costo promedio ponderado** por variante, recalculado en cada entrada, en "Bodega Apnea". El valor se lleva en centavos exactos, así que inventario y diario coinciden al centavo.
- **Punto de venta** (pestaña Merch y botón "Vendí merch"): mesa de productos, selector de variante, carrito con +/−, regalo por línea, efectivo o transferencia, quién cobró y canal. Botón "Cobrar $X" y pantalla de éxito.
- **Sin señal**: precios y existencias salen de la caché; lo vendido ya descuenta del stock que se ve y suma al efectivo de quien cobró.
- **Entró merch** (compra), **Regalé**, y para el contador **Se dañó** (merma) y **Conté** (ajuste por conteo).
- **Resumen de la noche**: lo vendido hoy, piezas y lo que queda después del costo.
- **Alertas**: "Quedan N", "Agotado" y "Faltan N". El stock puede quedar negativo; nunca bloquea una venta y deja aviso en la bitácora.
- **Anular una venta** repone el inventario a su costo original.

### Ajustes posteriores (2026-11-10)

- **Editar producto**: casillas rotuladas; las existencias se corrigen con un conteo desde la variante.
- **Entró merch**: compra nueva o saldo inicial, con la cuenta completa antes de guardar.
- **Movimientos por variante**: dónde se revisa el costo, renglón por renglón.
- **Calculadora de cambio** en el cobro en efectivo.
- **Foto por producto**, que sube cualquier integrante.
- **Correcciones**: al abrir la app se refresca siempre desde el servidor, y el sync reintenta solo.
- **Canal de la venta**: si es Show hay que elegir cuál; si es Otro se puede anotar a qué se refiere.
- **Contador − / +** en cada artículo de la mesa de merch y en cada talla.

### Pruebas (todas en verde)

| Suite                                              | Resultado |
| -------------------------------------------------- | --------- |
| pgTAP (213 en total; 70 de merch)                  | 213/213   |
| Vitest (69 en total; carrito, stock, costo y sync) | 69/69     |
| Playwright con sesión simulada                     | 11/11     |
| Playwright real contra Supabase local              | 19/19     |
| Lint, typecheck, Prettier                          | limpios   |

Criterios de aceptación del plan, cubiertos por `e2e/fase2-real.spec.ts`:

1. Vender 3 playeras (una de regalo) sin señal → al sincronizar: inventario 7 piezas a $120, costo de venta $240, merch regalado $120 y efectivo $700, con la balanza cuadrada.
2. Anular la venta → 10 piezas, efectivo $0, balanza cuadrada.

### Lo que NO está hecho o quedó distinto

1. **No se ha probado en un celular real.**
2. **Una sola variante por movimiento** en Entró merch, Regalé, Se dañó y Conté (la base ya acepta varias líneas por compra).
3. **Canal "Tienda web"** existe en la base pero no se muestra (PRD: futuro).
4. **Las alertas de stock** se ven en la mesa de merch y en el catálogo; el tablero de alertas del contador llega en la Fase 5 y las notificaciones en la Fase 6.

### Cómo probarlo en la compu

1. `git checkout fase-2`, `pnpm db:start`, `pnpm db:reset`, crea tu contador y entra con `pnpm dev`.
2. Más → Modo contador → **Productos y precios** → Nuevo producto (ej. Playera Logo, variantes S/M/L a 350).
3. **Merch** → 📦 Entró merch → la playera M → 10 piezas → $120 cada una → Cuenta de la banda.
4. Toca la playera, elige M, y **Cobrar**. En el cobro prueba +/−, 🎁 Regalo, Transferencia y quién cobró.
5. Modo avión (F12 → Network → Offline): vende; el stock baja y en Inicio dice "Sin señal · 1 guardado". Quita el modo avión.
6. Movimientos → toca la venta → Anular: el stock regresa.
7. Más → Productos y precios: revisa existencias, costo promedio e inventario valuado. Balanza: debe cuadrar.

---

## Fase 1 — Núcleo contable + captura básica · aprobada el 2026-11-10

Está en `main` y en la base de desarrollo de la nube. Falta comprobarla en un celular con la app instalada (el sitio de Netlify sigue protegido).

### Hecho y verificado en la compu

- **Base**: catálogo de cuentas del PRD §5.1, subcuentas por integrante que se crean solas, periodos mensuales, diario con cuadre obligatorio e inmutable, categorías, tipos de proyecto, proyectos y contactos.
- **Eventos y RPC**: `submit_event` (idempotente), `confirm_cash_transfer` y `void_event`.
- **Posteo**: gasto (todas las formas de pago), cobro, entrega de efectivo con confirmación, depósito, puse dinero (préstamo o aportación), reclasificación, regresar dinero y pago a proveedor.
- **Celular**: outbox en Dexie, sync idempotente con reintentos, saldos optimistas, caché de lecturas para abrir sin señal.
- **Pantallas**: Gasté, Cobré, Pasé efectivo, Puse dinero; Inicio con saldo personal, resultado del mes o de la gira, pendientes por confirmar, feed en vivo e indicador de sync; Movimientos con detalle y anulación.
- **Contexto activo**: "¿En qué andamos?" sincronizado en vivo.
- **Contador**: libro diario, balanza y alta de giras y proyectos.

### Ajustes posteriores (2026-11-10)

- **Cobré → 🎤 Show en vivo**.
- **Todos pueden crear giras, shows y proyectos** (Más → Giras y proyectos, o desde "¿En qué andamos?").
- **Cada gasto o cobro se puede asignar a un proyecto** al confirmarlo: "Para: … · Cambiar".
- Proyecto **Ensayos generales** ya creado.

### Pruebas (todas en verde)

| Suite                                               | Resultado |
| --------------------------------------------------- | --------- |
| pgTAP (asientos, idempotencia, anulación, permisos) | 143/143   |
| Vitest (dinero, outbox, sync, textos, saldos)       | 50/50     |
| Playwright con sesión simulada                      | 11/11     |
| Playwright real contra Supabase local               | 8/8       |
| Lint, typecheck, Prettier                           | limpios   |

Los tres criterios de aceptación del plan están cubiertos por la prueba real `e2e/fase1-real.spec.ts`:

1. Gasto con mi dinero en modo avión → al volver la señal se sincroniza una sola vez y aparece en el otro celular sin recargar.
2. Una entrega de efectivo no mueve saldos hasta que el receptor confirma.
3. La balanza cuadra.

### Lo que NO está hecho o quedó distinto

2. **No se ha probado en un celular real**, solo en navegador con tamaño de celular.
3. **Regresar dinero, pagar a proveedor y reclasificar** funcionan en la base y están probados, pero aún no tienen pantalla (el plan solo pide cuatro flujos en esta fase).
4. **Peso de Inicio: ~224 KB gzip de JS**, arriba del límite de 200 KB del PRD. Queda para la auditoría de rendimiento de la Fase 6.
5. **"Pago de un show" y "Vendí merch"** llegan en las Fases 3 y 2.
6. **Cambiar el contexto activo** necesita internet (lo demás funciona sin señal).

### Cómo probarlo en la compu

1. Docker Desktop abierto; en `C:\dev\moodra-caja`: `git checkout fase-1` y `pnpm db:start`.
2. `pnpm db:reset` para empezar limpio (borra los datos locales de prueba).
3. Crea tu contador como en la Fase 0 (`pnpm crear-contador`) y entra con `pnpm dev` en `http://localhost:5173`.
4. Crea otro usuario en Más → Modo contador → Usuarios, y ábrelo en una ventana de incógnito para tener "dos celulares".
5. Prueba, en orden:
   - **Gasté** → $850 → Transporte → Mi dinero → Regrésenmelo → Guardar. Debe decir "Te debemos $850".
   - **Deshacer** en el aviso de un gasto nuevo: el saldo regresa.
   - **Cobré** → Patrocinio → $500 → Lo traigo yo en efectivo.
   - **Pasé efectivo** → $200 → al otro usuario. En la otra ventana aparece "¿Lo recibiste?"; los saldos cambian hasta que diga Sí.
   - **Modo avión**: en las herramientas del navegador (F12 → Network → Offline) registra un gasto; dirá "Sin señal · 1 guardado en tu celular". Quita el modo avión y debe decir "Todo al día ✓".
   - **Movimientos** → toca un registro → Anular (pide motivo). Queda tachado.
   - **Más → Modo contador → Balanza**: "La balanza cuadra ✓". **Libro diario**: un asiento por registro.
   - **Giras y proyectos** → crea una gira → en Inicio toca "Operación general" y elígela.

### Cómo se probará en el celular

Cuando se publique: abrir `https://fanciful-granita-b043f1.netlify.app`, entrar y repetir los pasos de arriba con dos celulares. El modo avión real es la prueba que más importa.

### Comandos

| Qué                   | Comando                               |
| --------------------- | ------------------------------------- |
| App en desarrollo     | `pnpm dev`                            |
| Supabase local        | `pnpm db:start` · `pnpm db:stop`      |
| Lint / tipos          | `pnpm lint` · `pnpm typecheck`        |
| Vitest                | `pnpm test`                           |
| Playwright (simulado) | `pnpm test:e2e`                       |
| Playwright + real     | `$env:E2E_REAL='1'; pnpm test:e2e`    |
| pgTAP                 | `pnpm db:test`                        |
| Tipos de la BD        | `pnpm db:types`                       |
| Borrar datos locales  | `pnpm db:reset`                       |
| Subir migraciones     | `pnpm exec supabase db push --remote` |

---

## Fase 0 — Cimientos · aprobada el 2026-11-10

- Monorepo, PWA, design system con la identidad de moodra.mx en tema claro, login, usuarios y Supabase local y en la nube.
- Repo: `github.com/moodramx/moodra-caja`. Supabase de desarrollo: `moodra-caja-dev` (`ndoxwuqqrwiagnzfvsms`). Netlify: `fanciful-granita-b043f1.netlify.app`.
- Usuarios en la nube: `diego` (contador), `pepe`, `rams`, `uli`. Falta el becario.
- **Pendiente abierto**: el sitio de Netlify sigue detrás del inicio de sesión de Netlify; hay que quitarlo antes de compartirlo con la banda, y solo entonces se puede probar la instalación completa y el uso sin señal en un celular.
- **Sin confirmar**: si el CI de GitHub Actions pasa.
