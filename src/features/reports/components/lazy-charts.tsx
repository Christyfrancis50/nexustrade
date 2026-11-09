'use client'

import dynamic from 'next/dynamic'

// Recharts is ~100 KB: load it only on the reports page, after the shell renders.
const placeholder = () => <div className="h-64 animate-pulse rounded-lg bg-foreground/5" />

export const SpendChart = dynamic(() => import('./charts').then((m) => m.SpendChart), { ssr: false, loading: placeholder })
export const CarrierChart = dynamic(() => import('./charts').then((m) => m.CarrierChart), { ssr: false, loading: placeholder })
export const StatusChart = dynamic(() => import('./charts').then((m) => m.StatusChart), { ssr: false, loading: placeholder })
