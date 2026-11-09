import type { Metadata } from 'next'
import { RoleWorkspace } from '@/features/auth/components/role-workspace'

export const metadata: Metadata = { title: 'Finance · NexusTrade' }

export default function FinancePage() {
  return (
    <RoleWorkspace
      role="finance"
      tools={[
        { title: 'Ledger', body: 'Append-only double-entry ledger in AED with multi-currency FX.', phase: 4 },
        { title: 'Escrow releases', body: 'Release booking, customs and delivery milestones to carriers.', phase: 7 },
        { title: 'VAT & exports', body: 'VAT audit report and CSV exports for Zoho Books and Xero.', phase: 8 },
      ]}
    />
  )
}
