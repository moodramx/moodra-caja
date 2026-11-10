import { createFileRoute } from '@tanstack/react-router'
import { DiarioPage } from '../../../features/contador/ContadorPages'

export const Route = createFileRoute('/_app/contador/diario')({ component: DiarioPage })
