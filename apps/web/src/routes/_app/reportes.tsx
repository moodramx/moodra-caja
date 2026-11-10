import { createFileRoute } from '@tanstack/react-router'
import { ReportesPage } from '../../features/reportes/ReportesPage'

export const Route = createFileRoute('/_app/reportes')({ component: ReportesPage })
