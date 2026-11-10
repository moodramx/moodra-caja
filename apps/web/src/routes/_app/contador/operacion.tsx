import { createFileRoute } from '@tanstack/react-router'
import { OperacionPage } from '../../../features/contador/Operacion'

export const Route = createFileRoute('/_app/contador/operacion')({ component: OperacionPage })
