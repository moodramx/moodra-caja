import { createFileRoute } from '@tanstack/react-router'
import { EmptyState, Page } from '../../design/Page'

export const Route = createFileRoute('/_app/merch')({
  component: () => (
    <Page number="03" title="Merch">
      <EmptyState
        emoji="👕"
        title="La mesa de merch está vacía"
        hint="Aquí vas a vender playeras, vinilos y stickers en dos toques."
      />
    </Page>
  ),
})
