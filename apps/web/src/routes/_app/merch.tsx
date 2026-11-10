import { createFileRoute } from '@tanstack/react-router'
import { MerchPage } from '../../features/merch/MerchPage'

export const Route = createFileRoute('/_app/merch')({ component: MerchPage })
