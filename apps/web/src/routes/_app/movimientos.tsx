import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, Page } from '../../design/Page'
import { Feed, useFeedIsEmpty } from '../../features/feed/Feed'

export const Route = createFileRoute('/_app/movimientos')({ component: MovimientosPage })

function MovimientosPage() {
  const empty = useFeedIsEmpty(100)
  return (
    <Page number="02" title="Movimientos">
      {empty ? (
        <EmptyState
          emoji="🧾"
          title="Sin movimientos todavía"
          hint="Aquí vas a ver todo lo que la banda gasta, cobra y vende."
        />
      ) : (
        <>
          <p className="text-ink-muted">
            Todo lo que ha registrado la banda. Toca uno para ver el detalle.
          </p>
          <Feed limit={100} />
        </>
      )}
    </Page>
  )
}
