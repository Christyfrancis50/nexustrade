'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const aed = (n: number) => `AED ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  IN_TRANSIT: '#0ea5e9',
  CUSTOMS_HOLD: '#f59e0b',
  CLEARED: '#8b5cf6',
  DELIVERED: '#10b981',
}

export function SpendChart({ data }: { data: Array<{ month: string; aed: number }> }) {
  return (
    <div className="h-64" role="img" aria-label={`Freight funded per month: ${data.map((d) => `${d.month} ${aed(d.aed)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.15} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={12} width={40} />
          <Tooltip formatter={(v) => aed(Number(v))} cursor={{ fillOpacity: 0.05 }} />
          <Bar dataKey="aed" name="Freight funded" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CarrierChart({ data }: { data: Array<{ carrier: string; aed: number }> }) {
  return (
    <div className="h-64" role="img" aria-label={`Freight by carrier: ${data.map((d) => `${d.carrier} ${aed(d.aed)}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} strokeOpacity={0.15} />
          <XAxis type="number" tickFormatter={short} tickLine={false} axisLine={false} fontSize={12} />
          <YAxis type="category" dataKey="carrier" width={130} tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip formatter={(v) => aed(Number(v))} cursor={{ fillOpacity: 0.05 }} />
          <Bar dataKey="aed" name="Freight" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StatusChart({ data }: { data: Array<{ status: string; count: number }> }) {
  return (
    <div className="h-64" role="img" aria-label={`Shipments by status: ${data.map((d) => `${d.status} ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.15} />
          <XAxis dataKey="status" tickFormatter={(s: string) => s.replace('_', ' ').toLowerCase()} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={24} />
          <Tooltip cursor={{ fillOpacity: 0.05 }} />
          <Bar dataKey="count" name="Shipments" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.status} fill={COLORS[d.status] ?? '#94a3b8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
