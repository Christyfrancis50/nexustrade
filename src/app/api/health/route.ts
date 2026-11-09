import { NextResponse } from 'next/server'

/** Liveness probe for Docker / uptime monitors. Reveals nothing about configuration. */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
