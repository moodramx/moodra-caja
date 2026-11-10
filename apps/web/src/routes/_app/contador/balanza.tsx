import { createFileRoute } from '@tanstack/react-router'
import { BalanzaPage } from '../../../features/contador/ContadorPages'

export const Route = createFileRoute('/_app/contador/balanza')({ component: BalanzaPage })
