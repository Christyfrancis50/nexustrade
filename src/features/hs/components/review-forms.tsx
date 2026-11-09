'use client'

import { useActionState } from 'react'
import { clearShipmentAction, decideLineAction, holdShipmentAction, refreshSuggestionsAction, type ActionState } from '../actions'
import type { QueueLine } from '../queries'

const pct = (n: number) => `${Math.round(n * 100)}%`
const duty = (bp: number) => `${bp / 100}% duty`

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null
  return (
    <p role="status" className={`text-sm ${state.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
      {state.message}
    </p>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 0.75 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${pct(value)}`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
        <span className={`block h-full ${tone}`} style={{ width: pct(value) }} />
      </span>
      <span className="tabular-nums text-xs text-foreground/60">{pct(value)}</span>
    </span>
  )
}

export function LineDecision({ line }: { line: QueueLine }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(decideLineAction, {})
  const decided = line.hsStatus === 'APPROVED' || line.hsStatus === 'OVERRIDDEN'
  const options = [...line.alternatives]
  if (line.hsCode && line.current && !options.some((o) => o.code === line.hsCode))
    options.unshift({ code: line.hsCode, description: line.current.description, heading: '', dutyRateBp: line.current.dutyRateBp, restricted: line.current.restricted, confidence: line.confidence ?? 0, method: 'keyword' })

  return (
    <div className="flex flex-col gap-3 border-t border-foreground/10 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          <span className="mr-2 tabular-nums text-foreground/65">{line.lineNo}</span>
          {line.description}
        </p>
        <span className="text-sm tabular-nums text-foreground/60">
          {Number(line.quantity).toLocaleString('en-US')} {line.unit} · {line.value}
        </span>
      </div>

      {decided ? (
        <p className="text-sm">
          <span className="font-mono">{line.hsCode}</span> · {line.current?.description}
          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-200">{line.hsStatus.toLowerCase()}</span>
          {line.restricted && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-800 dark:text-red-200">restricted</span>}
          {line.current && <span className="ml-2 text-foreground/60">est. {line.current.dutyEstimate} ({duty(line.current.dutyRateBp)})</span>}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="lineItemId" value={line.id} />
          {options.length === 0 && <p className="text-sm text-foreground/60">No suggestions. Enter a code below.</p>}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">Suggested HS codes</legend>
            {options.map((o, i) => (
              <label key={o.code} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-foreground/5">
                <input type="radio" name="choice" value={o.code} defaultChecked={o.code === line.hsCode || (!line.hsCode && i === 0)} className="mt-1" />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm">
                    <span className="font-mono font-medium">{o.code}</span> {o.description}
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
                    <ConfidenceBar value={o.confidence} />
                    <span>{duty(o.dutyRateBp)}</span>
                    {o.restricted && <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-red-800 dark:text-red-200">permit required</span>}
                    {o.code === line.hsCode && <span>current suggestion</span>}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <input name="override" inputMode="numeric" pattern="\d{6}" placeholder="Or type a 6-digit code" aria-label="Override HS code" className="w-48 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 font-mono text-sm" />
            <input name="note" placeholder="Note (required when overriding)" aria-label="Decision note" className="min-w-56 flex-1 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm" />
            <button disabled={pending} className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50">
              {pending ? 'Saving…' : 'Confirm code'}
            </button>
          </div>
          <Feedback state={state} />
        </form>
      )}
    </div>
  )
}

export function ShipmentControls({ shipmentId, ready, blockers, status, hasUnclassified }: { shipmentId: string; ready: boolean; blockers: string[]; status: string; hasUnclassified: boolean }) {
  const [clearState, clear, clearing] = useActionState<ActionState, FormData>(clearShipmentAction, {})
  const [holdState, hold, holding] = useActionState<ActionState, FormData>(holdShipmentAction, {})
  const [suggestState, suggest, suggesting] = useActionState<ActionState, FormData>(refreshSuggestionsAction, {})

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-foreground/[0.03] p-4">
      {blockers.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-foreground/70">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form action={clear}>
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <button disabled={!ready || clearing} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {clearing ? 'Clearing…' : 'Clear customs'}
          </button>
        </form>
        {hasUnclassified && (
          <form action={suggest}>
            <input type="hidden" name="shipmentId" value={shipmentId} />
            <button disabled={suggesting} className="rounded-md border border-foreground/15 px-3 py-1.5 text-sm disabled:opacity-50">
              {suggesting ? 'Suggesting…' : 'Suggest codes'}
            </button>
          </form>
        )}
        {status === 'IN_TRANSIT' && (
          <form action={hold} className="flex items-center gap-2">
            <input type="hidden" name="shipmentId" value={shipmentId} />
            <input name="reason" placeholder="Hold reason" aria-label="Hold reason" className="w-44 rounded-md border border-foreground/15 bg-transparent px-2 py-1.5 text-sm" />
            <button disabled={holding} className="rounded-md border border-amber-500/40 px-3 py-1.5 text-sm text-amber-900 disabled:opacity-50 dark:text-amber-200">
              Place on hold
            </button>
          </form>
        )}
      </div>
      <Feedback state={clearState} />
      <Feedback state={holdState} />
      <Feedback state={suggestState} />
    </div>
  )
}
