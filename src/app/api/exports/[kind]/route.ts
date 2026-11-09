import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/db'
import { getSessionUser } from '@/lib/auth/session'
import { journalCsv, vatCsv, xeroJournalCsv } from '@/features/reports/build'
import { invoiceRows, journalLines } from '@/features/reports/data'
import { parsePeriod } from '@/features/reports/period'

const KINDS = {
  journal: { file: 'nexustrade-journal', build: async (from: Date, to: Date) => journalCsv(await journalLines(db(), from, to)) },
  xero: { file: 'nexustrade-xero-manual-journal', build: async (from: Date, to: Date) => xeroJournalCsv(await journalLines(db(), from, to)) },
  vat: { file: 'nexustrade-vat-register', build: async (from: Date, to: Date) => vatCsv(await invoiceRows(db(), from, to)) },
} as const

/** Finance-only CSV downloads: /api/exports/{journal|xero|vat}?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (user.role !== 'finance') return NextResponse.json({ error: 'Finance only' }, { status: 403 })

  const { kind } = await ctx.params
  const spec = KINDS[kind as keyof typeof KINDS]
  if (!spec) return NextResponse.json({ error: 'Unknown export' }, { status: 404 })

  let period
  try {
    period = parsePeriod({ from: req.nextUrl.searchParams.get('from'), to: req.nextUrl.searchParams.get('to') })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid period' }, { status: 400 })
  }

  const csv = await spec.build(period.from, period.toExclusive)
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${spec.file}_${period.label.from}_${period.label.to}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
