import { createFileRoute } from '@tanstack/react-router'
import { ShowsPage } from '../../features/shows/Shows'

export const Route = createFileRoute('/_app/shows')({ component: ShowsPage })
