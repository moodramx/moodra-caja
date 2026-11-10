import { createFileRoute } from '@tanstack/react-router'
import { InicioPage } from '../../features/inicio/InicioPage'

export const Route = createFileRoute('/_app/')({ component: InicioPage })
