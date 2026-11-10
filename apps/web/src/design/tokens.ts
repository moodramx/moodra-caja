// Tokens para uso desde JS (gráficas, PDF, meta tags). Los estilos usan las
// variables CSS de src/index.css, que son la fuente de verdad; estos valores
// deben coincidir con ellas.
export const tokens = {
  color: {
    bg: '#0b0a0c',
    surface: '#151317',
    surface2: '#1f1c23',
    line: '#2c2831',
    ink: '#f5f3f7',
    inkMuted: '#a8a2b3',
    accent: '#ffffff',
    in: '#8fd6a8',
    pending: '#f2b84b',
    void: '#7b7586',
    danger: '#f29c9c',
  },
  /** Mínimo táctil en px (CLAUDE.md: ≥ 48). */
  touchTarget: 48,
  /** Duración del toast con "Deshacer", en ms. */
  undoWindowMs: 10_000,
} as const
