# Prompt inicial para Claude Code — Moodra $$

**Cómo usarlo:** crea una carpeta vacía para el proyecto, mete ahí `CLAUDE.md` y la carpeta `docs/` (con `PRD.md` y `PLAN.md`), abre Claude Code en esa carpeta y pega todo lo que está debajo de la línea.

---

Vas a construir **Moodra $$**, el sistema contable de gira y operación de la banda Moodra: una PWA instalable (web + celular) con backend en Supabase, con una interfaz súper simple para los integrantes y una interfaz completa para el contador.

Antes de escribir código:

1. Lee completos `CLAUDE.md`, `docs/PRD.md` y `docs/PLAN.md`. Son la fuente de verdad. Si algo del PRD choca con una buena práctica técnica, dímelo y propón la alternativa; no te desvíes en silencio.
2. Verifica las versiones estables actuales de cada dependencia del stack (no asumas de memoria) y confirma que los planes gratuitos de Supabase y Netlify siguen cubriendo lo descrito en el PRD §11.
3. Si algo es ambiguo **y bloquea la Fase 0**, hazme máximo 5 preguntas. Lo que no bloquee, decídelo tú con criterio y anótalo en `docs/DECISIONES.md` (fecha, decisión, alternativa descartada, por qué).

Después ejecuta **solo la Fase 0** de `docs/PLAN.md`. Al terminar cada fase:

- Corre todas las pruebas (pgTAP, Vitest, Playwright) y asegúrate de que pasen.
- Actualiza `docs/PROGRESO.md` con lo hecho, lo pendiente y los pasos exactos para que yo lo pruebe en mi celular.
- Detente y espera mi revisión antes de pasar a la siguiente fase.

Reglas que no se negocian (el detalle está en CLAUDE.md):

- El dinero siempre va en centavos enteros (`bigint`), nunca en float.
- Toda escritura contable pasa por funciones SQL transaccionales; el cliente nunca inserta en `journal_*`.
- Nada se borra ni se edita una vez registrado: se anula con asiento de reversa.
- Toda captura funciona sin internet desde el día uno (outbox local + idempotencia).
- La interfaz de integrante nunca muestra lenguaje contable ("cargo", "abono", "cuenta 5.3.02", "póliza").
