import { createFileRoute } from '@tanstack/react-router'
import { ComponentesPage } from '../../features/mas/ComponentesPage'

export const Route = createFileRoute('/_app/componentes')({ component: ComponentesPage })
