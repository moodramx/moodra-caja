import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, Page } from '../../design/Page'

export const Route = createFileRoute('/_app/reportes')({
  component: () => (
    <Page number="04" title="Reportes">
      <EmptyState
        emoji="📈"
        title="Todavía no hay números"
        hint="Aquí vas a ver cómo le fue a cada show y a cada gira."
      />
    </Page>
  ),
})
