import { createFileRoute } from '@tanstack/react-router'
import { ProyectosPage } from '../../../features/contador/ContadorPages'

export const Route = createFileRoute('/_app/contador/proyectos')({ component: ProyectosPage })
