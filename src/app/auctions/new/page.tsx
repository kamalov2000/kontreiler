import { Suspense } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderForm } from '@/components/orders/OrderForm'

export default function NewAuctionPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    }>
      <OrderForm mode="torg" />
    </Suspense>
  )
}
