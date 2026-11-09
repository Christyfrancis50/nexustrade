'use client'

import { useActionState, useRef, useState } from 'react'
import { uploadDocument, type UploadState } from '../actions'

const TYPES = [
  ['COMMERCIAL_INVOICE', 'Commercial invoice'],
  ['BILL_OF_LADING', 'Bill of lading'],
  ['AIRWAY_BILL', 'Airway bill'],
  ['PACKING_LIST', 'Packing list'],
  ['PROOF_OF_DELIVERY', 'Proof of delivery'],
] as const

export function UploadForm({ shipmentId }: { shipmentId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadDocument, {})
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const pick = (files: FileList | null) => {
    if (!files?.[0] || !input.current) return
    const dt = new DataTransfer()
    dt.items.add(files[0])
    input.current.files = dt.files
    setFileName(files[0].name)
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-foreground/10 p-5">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Upload a document</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-foreground/60">Type</span>
          <select name="documentType" defaultValue="COMMERCIAL_INVOICE" className="rounded-md border border-foreground/15 bg-transparent px-2 py-1.5">
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          dragging ? 'border-foreground/60 bg-foreground/5' : 'border-foreground/15 hover:border-foreground/30'
        }`}
      >
        <input
          ref={input}
          type="file"
          name="file"
          accept="application/pdf,image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => pick(e.target.files)}
        />
        <span className="font-medium">{fileName ?? 'Drop a PDF, PNG or JPEG here, or click to choose'}</span>
        <span className="text-xs text-foreground/50">Up to 10 MB. The AI reads it and every total is re-checked.</span>
      </label>

      <button
        type="submit"
        disabled={pending || !fileName}
        className="self-start rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? 'Reading document…' : 'Upload & extract'}
      </button>

      {state.message && (
        <div
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${state.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-amber-500/10 text-amber-900 dark:text-amber-200'}`}
        >
          <p className="font-medium">{state.message}</p>
          {state.flags && state.flags.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {state.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  )
}
