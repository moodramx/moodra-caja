import { createFileRoute } from '@tanstack/react-router'
import { CierresPage } from '../../../features/contador/Operacion'

export const Route = createFileRoute('/_app/contador/cierres')({ component: CierresPage })
