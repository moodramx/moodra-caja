// Tokens para uso desde JS (gráficas, PDF, meta tags). Los estilos usan las
// variables CSS de src/index.css, que son la fuente de verdad; estos valores
// deben coincidir con ellas. Tema claro; tipografías y formas de moodra.mx.
export const tokens = {
  color: {
    bg: '#ffffff',
    surface: '#f6f3ee',
    surface2: '#ebe6dd',
    line: 'rgba(11, 10, 12, 0.16)',
    ink: '#0b0a0c',
    inkMuted: '#524d46',
    accent: '#8f1fb3',
    lavender: '#c9a7ff',
    in: '#17683a',
    pending: '#8f5200',
    void: '#68635b',
    danger: '#b3261e',
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
