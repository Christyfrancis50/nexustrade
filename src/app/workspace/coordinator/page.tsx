import type { Metadata } from 'next'
import { RoleWorkspace } from '@/features/auth/components/role-workspace'

export const metadata: Metadata = { title: 'Coordinator · NexusTrade' }

export default function CoordinatorPage() {
  return (
    <RoleWorkspace
      role="coordinator"
      tools={[
        { title: 'Shipments', body: 'Create shipments and track them from booking to proof of delivery.', phase: 3 },
        { title: 'Document upload', body: 'Drop bills of lading, airway bills and invoices for AI extraction.', phase: 5 },
        { title: 'Packing slips', body: 'Generate packing slips from extracted line items.', phase: 8 },
      ]}
    />
  )
}
