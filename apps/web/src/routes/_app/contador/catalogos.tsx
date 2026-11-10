import { createFileRoute } from '@tanstack/react-router'
import { CatalogosPage } from '../../../features/contador/Catalogos'

export const Route = createFileRoute('/_app/contador/catalogos')({ component: CatalogosPage })
