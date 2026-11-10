import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'src/routeTree.gen.ts', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Los archivos de ruta exportan `Route` además del componente.
  // Los proveedores de contexto exportan su hook junto al componente.
  {
    files: [
      'src/routes/**/*.tsx',
      'src/design/Toast.tsx',
      'src/lib/auth.tsx',
      'src/lib/mode.tsx',
      'src/features/feed/Feed.tsx',
      'src/features/captura/parts.tsx',
      'src/features/proyectos/Proyectos.tsx',
      'src/features/merch/MerchPage.tsx',
      'src/features/shows/Shows.tsx',
      'src/main.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  // Playwright: `use` es de sus fixtures, no un hook de React.
  { files: ['e2e/**/*.ts'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
)
