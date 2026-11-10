// Tokens para uso desde JS (gráficas, PDF, meta tags). Los estilos usan las
// variables CSS de src/index.css, que son la fuente de verdad; estos valores
// deben coincidir con ellas. Origen: moodra.mx (site/css/styles.css).
export const tokens = {
  color: {
    bg: '#0b0a0c',
    surface: '#141216',
    surface2: '#1e1b21',
    line: 'rgba(239, 233, 223, 0.16)',
    ink: '#efe9df',
    inkMuted: '#a9a298',
    accent: '#c9a7ff',
    violet: '#b026d9',
    in: '#8fd6a8',
    pending: '#f2b84b',
    void: '#8a847b',
    danger: '#f29c9c',
  },
  font: {
    display: "'Fraunces', 'Cooper Black', Georgia, serif",
    body: "'Manrope', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  /** Mínimo táctil en px (CLAUDE.md: ≥ 48). */
  touchTarget: 48,
  /** Duración del toast con "Deshacer", en ms. */
  undoWindowMs: 10_000,
} as const
