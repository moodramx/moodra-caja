import { createFileRoute } from '@tanstack/react-router'
import { MasPage } from '../../features/mas/MasPage'

export const Route = createFileRoute('/_app/mas')({ component: MasPage })
