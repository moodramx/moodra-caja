import { createFileRoute } from '@tanstack/react-router'
import { ProductosPage } from '../../../features/merch/ProductosPage'

export const Route = createFileRoute('/_app/contador/productos')({ component: ProductosPage })
