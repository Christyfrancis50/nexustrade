import type { Metadata } from 'next'
import { RoleWorkspace } from '@/features/auth/components/role-workspace'

export const metadata: Metadata = { title: 'Customs broker · NexusTrade' }

export default function BrokerPage() {
  return (
    <RoleWorkspace
      role="broker"
      tools={[
        { title: 'HS review queue', body: 'Approve or override AI-suggested HS codes with confidence scores.', phase: 6 },
        { title: 'Duty approval', body: 'Confirm estimated duties before invoices are issued.', phase: 6 },
        { title: 'Restricted goods', body: 'Flag hazardous or restricted items and place shipments on customs hold.', phase: 6 },
      ]}
    />
  )
}
