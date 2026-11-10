import { createFileRoute } from '@tanstack/react-router'
import { AsientoPage } from '../../../features/contador/Operacion'

export const Route = createFileRoute('/_app/contador/asiento')({ component: AsientoPage })
