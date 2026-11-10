import { createFileRoute } from '@tanstack/react-router'
import { TransportePage } from '../../features/transporte/TransportePage'

export const Route = createFileRoute('/_app/transporte')({ component: TransportePage })
