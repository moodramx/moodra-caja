import { createFileRoute } from '@tanstack/react-router'
import { SaldosPage } from '../../features/saldos/SaldosPage'

export const Route = createFileRoute('/_app/saldos')({ component: SaldosPage })
