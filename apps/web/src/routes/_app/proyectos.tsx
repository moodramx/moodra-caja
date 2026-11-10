import { createFileRoute } from '@tanstack/react-router'
import { ProyectosPage } from '../../features/proyectos/Proyectos'

export const Route = createFileRoute('/_app/proyectos')({ component: ProyectosPage })
