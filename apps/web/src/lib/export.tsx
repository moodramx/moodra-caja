// Exportación de reportes a Excel y PDF. Las librerías pesan, así que se cargan
// solo cuando alguien pide una descarga (no entran en la carga inicial).
import { centsToDecimalString, formatMXN } from './money'
import type { Cell, Report } from './reports'

/** Texto de una celda para pantalla y PDF. */
export function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'bigint') return formatMXN(cell)
  return String(cell)
}

/** Nombre de hoja válido para Excel: sin caracteres prohibidos, máximo 31, sin repetir. */
export function sheetNames(reports: Report[]): string[] {
  const used = new Set<string>()
  return reports.map((report) => {
    const base =
      report.title
        .replace(/[\\/?*[\]:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31) || 'Reporte'
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const suffix = ` ${i}`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())
    return name
  })
}

/** "Estado de resultados noviembre 2026" → "moodra-estado-de-resultados-noviembre-2026". */
export function fileName(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `moodra-${slug}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Un libro de Excel con una hoja por reporte. Los montos van como número con formato de pesos. */
export async function downloadExcel(reports: Report[], name: string) {
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  book.creator = 'Moodra $$'
  const names = sheetNames(reports)

  reports.forEach((report, index) => {
    const sheet = book.addWorksheet(names[index])
    sheet.addRow([report.title]).font = { bold: true, size: 14 }
    sheet.addRow([`Moodra · ${report.subtitle}`]).font = { color: { argb: 'FF666666' } }
    sheet.addRow([])
    const header = sheet.addRow(report.columns)
    header.font = { bold: true }
    header.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } }
    })

    for (const row of report.rows) {
      const added = sheet.addRow(
        report.columns.map((_, column) => {
          const cell = row.cells[column]
          // Excel necesita número; se convierte desde la cadena decimal exacta, no dividiendo.
          if (typeof cell === 'bigint') return Number(centsToDecimalString(cell))
          return cell ?? null
        }),
      )
      row.cells.forEach((cell, column) => {
        if (typeof cell === 'bigint')
          added.getCell(column + 1).numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00'
        if (column > 0) added.getCell(column + 1).alignment = { horizontal: 'right' }
      })
      if (row.kind) added.font = { bold: true }
      if (row.kind === 'grand') {
        added.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
        })
      }
    }

    sheet.columns.forEach((column, i) => {
      column.width = i === 0 ? 46 : 20
    })
    sheet.views = [{ state: 'frozen', ySplit: 4 }]
  })

  const buffer = await book.xlsx.writeBuffer()
  download(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${name}.xlsx`,
  )
}

/** Un PDF tamaño carta con un reporte por sección. */
export async function downloadPdf(reports: Report[], name: string) {
  const { Document, Page, Text, View, StyleSheet, pdf } = await import('@react-pdf/renderer')
  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#0b0a0c' },
    brand: { fontSize: 8, color: '#666666', letterSpacing: 1 },
    title: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 4 },
    subtitle: { fontSize: 10, color: '#444444', marginBottom: 12 },
    row: {
      flexDirection: 'row',
      paddingVertical: 3,
      borderBottomWidth: 0.5,
      borderBottomColor: '#dddddd',
    },
    head: {
      flexDirection: 'row',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: '#0b0a0c',
    },
    first: { flex: 3, paddingRight: 6 },
    cell: { flex: 1.3, textAlign: 'right' },
    bold: { fontFamily: 'Helvetica-Bold' },
    grand: { borderTopWidth: 1, borderTopColor: '#0b0a0c', borderBottomWidth: 0 },
    section: { marginTop: 8, borderBottomWidth: 0 },
    footer: {
      position: 'absolute',
      bottom: 18,
      left: 36,
      right: 36,
      fontSize: 7,
      color: '#888888',
    },
  })
  const printed = new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'America/Mexico_City',
  }).format(new Date())

  const doc = (
    <Document title={name} author="Moodra $$">
      {reports.map((report, index) => (
        <Page
          key={index}
          size="LETTER"
          orientation={report.columns.length > 4 ? 'landscape' : 'portrait'}
          style={styles.page}
        >
          <Text style={styles.brand}>MOODRA $$</Text>
          <Text style={styles.title}>{report.title}</Text>
          <Text style={styles.subtitle}>{report.subtitle}</Text>
          <View style={styles.head} fixed>
            {report.columns.map((column, i) => (
              <Text key={i} style={[i === 0 ? styles.first : styles.cell, styles.bold]}>
                {column}
              </Text>
            ))}
          </View>
          {report.rows.map((row, r) => (
            <View
              key={r}
              wrap={false}
              style={[
                styles.row,
                row.kind === 'grand' ? styles.grand : {},
                row.kind === 'section' ? styles.section : {},
              ]}
            >
              {report.columns.map((_, i) => (
                <Text
                  key={i}
                  style={[i === 0 ? styles.first : styles.cell, row.kind ? styles.bold : {}]}
                >
                  {cellText(row.cells[i])}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.footer} fixed>
            Generado el {printed} · Moodra $$
          </Text>
        </Page>
      ))}
    </Document>
  )
  download(await pdf(doc).toBlob(), `${name}.pdf`)
}
