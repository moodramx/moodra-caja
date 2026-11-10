import { createFileRoute } from '@tanstack/react-router'
import { UsuariosPage } from '../../../features/admin/UsuariosPage'

export const Route = createFileRoute('/_app/contador/usuarios')({ component: UsuariosPage })
