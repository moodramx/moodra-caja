// Genera el logo y la fuente de los íconos de la PWA a partir del logo de moodra.mx.
// Uso:  node scripts/generar-marca.mjs "<ruta a logo-white-1200.png>"
// Después:  pnpm --filter web icons
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const sharp = require('sharp')

const source = process.argv[2]
if (!source) {
  console.error('Falta la ruta al logo blanco de moodra.mx')
  process.exit(1)
}

const INK = '#0b0a0c'
const ACCENT = '#c9a7ff'
const out = new URL('../apps/web/public/', import.meta.url)

// 1. Wordmark recortado para el encabezado y el login.
const wordmark = sharp(source).trim()
await wordmark
  .clone()
  .resize({ width: 480 })
  .webp({ quality: 90 })
  .toFile(fileURLToPath(new URL('moodra-logo.webp', out)))

// 2. Ícono: wordmark + "$$" en el acento, para distinguirla de la web en la pantalla de inicio.
const small = await wordmark.clone().resize({ width: 300 }).png().toBuffer()
const { width, height } = await sharp(small).metadata()
const x = (512 - width) / 2
const y = 150
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  <image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/png;base64,${small.toString('base64')}"/>
  <text x="256" y="${y + height + 78}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="76" letter-spacing="10" fill="${ACCENT}">$$</text>
</svg>
`
await writeFile(new URL('logo.svg', out), svg)
console.log(`Listo: moodra-logo.webp y logo.svg (${width}×${height})`)
