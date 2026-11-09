'use client'

import { useActionState } from 'react'
import {
  markDeliveredAction,
  releaseMilestoneAction,
  simulatePaymentAction,
  startCheckoutAction,
  type EscrowActionState,
} from '../actions'

type Action = (prev: EscrowActionState, formData: FormData) => Promise<EscrowActionState>

function ActionButton({
  action,
  field,
  value,
  label,
  pendingLabel,
  disabled,
  title,
  tone = 'primary',
}: {
  action: Action
  field: string
  value: string
  label: string
  pendingLabel: string
  disabled?: boolean
  title?: string
  tone?: 'primary' | 'secondary'
}) {
  const [state, formAction, pending] = useActionState<EscrowActionState, FormData>(action, {})
  const style =
    tone === 'primary'
      ? 'bg-foreground text-background'
      : 'border border-foreground/15 hover:bg-foreground/5'
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name={field} value={value} />
      <button disabled={disabled || pending} title={title} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${style}`}>
        {pending ? pendingLabel : label}
      </button>
      {state.message && (
        <span role="status" className={`max-w-64 text-xs ${state.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
          {state.message}
        </span>
      )}
    </form>
  )
}

export function FundButtons({ shipmentId, stripeEnabled }: { shipmentId: string; stripeEnabled: boolean }) {
  return stripeEnabled ? (
    <ActionButton action={startCheckoutAction} field="shipmentId" value={shipmentId} label="Collect freight (Stripe test)" pendingLabel="Opening Stripe…" />
  ) : (
    <ActionButton
      action={simulatePaymentAction}
      field="shipmentId"
      value={shipmentId}
      label="Simulate test payment"
      pendingLabel="Funding…"
      title="Stripe keys not set: records a simulated payment through the same escrow path"
    />
  )
}

export function ReleaseButton({ milestoneId, blocker }: { milestoneId: string; blocker: string | null }) {
  return (
    <ActionButton
      action={releaseMilestoneAction}
      field="milestoneId"
      value={milestoneId}
      label="Release"
      pendingLabel="Releasing…"
      disabled={blocker !== null}
      title={blocker ?? 'Release to the carrier'}
      tone="secondary"
    />
  )
}

export function DeliveredButton({ shipmentId, disabledReason }: { shipmentId: string; disabledReason: string | null }) {
  return (
    <ActionButton
      action={markDeliveredAction}
      field="shipmentId"
      value={shipmentId}
      label="Mark delivered"
      pendingLabel="Saving…"
      disabled={disabledReason !== null}
      title={disabledReason ?? 'Confirm delivery against the signed proof of delivery'}
    />
  )
}
