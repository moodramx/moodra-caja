import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, Page } from '../../design/Page'

export const Route = createFileRoute('/_app/movimientos')({
  component: () => (
    <Page number="02" title="Movimientos">
      <EmptyState
        emoji="🧾"
        title="Sin movimientos todavía"
        hint="Aquí vas a ver todo lo que la banda gasta, cobra y vende."
      />
    </Page>
  ),
})
