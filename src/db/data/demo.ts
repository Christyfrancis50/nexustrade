import type { TaxTreatment } from '../../lib/tax/invoice'

export const DEMO_TRACKING_PREFIX = 'NXT-DEMO-'

export const ACCOUNTS = [
  { code: '1000', name: 'Cash (Stripe)', type: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '2100', name: 'Escrow Holding', type: 'LIABILITY' },
  { code: '2200', name: 'Carrier Payable', type: 'LIABILITY' },
  { code: '2300', name: 'VAT Payable', type: 'LIABILITY' },
  { code: '2400', name: 'Customs Duty Payable', type: 'LIABILITY' },
  { code: '3000', name: "Owner's Equity", type: 'EQUITY' },
  { code: '4000', name: 'Freight Revenue', type: 'REVENUE' },
  { code: '4100', name: 'Service Fee Revenue', type: 'REVENUE' },
  { code: '5000', name: 'Carrier Costs', type: 'EXPENSE' },
] as const

/** AED is pegged to USD at 3.6725. EUR and GBP are indicative demo rates. */
export const FX_RATES = [
  { currency: 'AED', rateToAed: '1' },
  { currency: 'USD', rateToAed: '3.6725' },
  { currency: 'EUR', rateToAed: '4.0150' },
  { currency: 'GBP', rateToAed: '4.7300' },
] as const

type Status = 'DRAFT' | 'IN_TRANSIT' | 'CUSTOMS_HOLD' | 'CLEARED' | 'DELIVERED'
type Cur = (typeof FX_RATES)[number]['currency']

export type DemoShipment = {
  trackingNumber: string
  mode: 'SEA' | 'AIR' | 'ROAD'
  status: Status
  shipperName: string
  shipperTrn: string | null
  consigneeName: string
  consigneeTrn: string | null
  carrierName: string
  originPort: string
  destinationPort: string
  freeZone: boolean
  freightAmount: string
  currency: Cur
  daysAgo: number
  treatment: TaxTreatment
  lines: Array<{ description: string; quantity: string; unit: string; unitPrice: string; weightKg: string; hsCode: string }>
}

// TRNs are fictitious 15-digit numbers in the UAE format.
export const DEMO_SHIPMENTS: DemoShipment[] = [
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0001`,
    mode: 'SEA',
    status: 'DRAFT',
    shipperName: 'Ningbo Hydraulic Components Co.',
    shipperTrn: null,
    consigneeName: 'Gulf Industrial Supplies LLC',
    consigneeTrn: '100234567800003',
    carrierName: 'Oceanic Lines',
    originPort: 'CNNGB',
    destinationPort: 'AEJEA',
    freeZone: false,
    freightAmount: '4800.00',
    currency: 'USD',
    daysAgo: 1,
    treatment: 'STANDARD',
    lines: [
      { description: 'Industrial hydraulic pump valve seals, nitrile rubber', quantity: '2000', unit: 'PCS', unitPrice: '1.85', weightKg: '120', hsCode: '401693' },
      { description: 'Gear pump assembly, cast iron, 40 L/min', quantity: '40', unit: 'PCS', unitPrice: '310.00', weightKg: '920', hsCode: '841360' },
    ],
  },
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0002`,
    mode: 'SEA',
    status: 'IN_TRANSIT',
    shipperName: 'Shanghai Bright Solar Ltd.',
    shipperTrn: null,
    consigneeName: 'Desert Sun Energy FZE',
    consigneeTrn: '100398765400003',
    carrierName: 'Oceanic Lines',
    originPort: 'CNSHA',
    destinationPort: 'AEJEA',
    freeZone: true,
    freightAmount: '6200.00',
    currency: 'USD',
    daysAgo: 12,
    treatment: 'EXEMPT',
    lines: [
      { description: 'Monocrystalline PV panels 550 W, assembled modules', quantity: '600', unit: 'PCS', unitPrice: '92.00', weightKg: '16800', hsCode: '854143' },
      { description: 'Solar string inverters 50 kW', quantity: '12', unit: 'PCS', unitPrice: '2150.00', weightKg: '960', hsCode: '850440' },
    ],
  },
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0003`,
    mode: 'SEA',
    status: 'CUSTOMS_HOLD',
    shipperName: 'Mumbai Agro Exports Pvt Ltd',
    shipperTrn: null,
    consigneeName: 'Emirates Fresh Foods Trading LLC',
    consigneeTrn: '100456789100003',
    carrierName: 'Arabian Sea Shipping',
    originPort: 'INNSA',
    destinationPort: 'AEJEA',
    freeZone: false,
    freightAmount: '9500.00',
    currency: 'AED',
    daysAgo: 18,
    treatment: 'STANDARD',
    lines: [
      { description: 'Basmati rice, wholly milled, 25 kg bags', quantity: '1200', unit: 'BAG', unitPrice: '78.00', weightKg: '30000', hsCode: '100630' },
      { description: 'Black tea, fermented, 500 g retail packs', quantity: '3000', unit: 'PCS', unitPrice: '9.50', weightKg: '1500', hsCode: '090230' },
    ],
  },
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0004`,
    mode: 'SEA',
    status: 'CLEARED',
    shipperName: 'Hamburg Maschinenbau GmbH',
    shipperTrn: null,
    consigneeName: 'Abu Dhabi Heavy Equipment LLC',
    consigneeTrn: '100567891200003',
    carrierName: 'Nordic Container Line',
    originPort: 'DEHAM',
    destinationPort: 'AEKHL',
    freeZone: false,
    freightAmount: '11800.00',
    currency: 'EUR',
    daysAgo: 30,
    treatment: 'STANDARD',
    lines: [
      { description: 'Hydraulic cylinders, double acting, linear', quantity: '24', unit: 'PCS', unitPrice: '1240.00', weightKg: '2880', hsCode: '841221' },
      { description: 'Excavator bucket teeth and adapters', quantity: '400', unit: 'PCS', unitPrice: '38.50', weightKg: '3200', hsCode: '843149' },
      { description: 'Steel ball bearings, sealed', quantity: '1500', unit: 'PCS', unitPrice: '6.20', weightKg: '450', hsCode: '848210' },
    ],
  },
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0005`,
    mode: 'SEA',
    status: 'DELIVERED',
    shipperName: 'Busan Electronics Co.',
    shipperTrn: null,
    consigneeName: 'Al Noor Electronics Trading LLC',
    consigneeTrn: '100678912300003',
    carrierName: 'Oceanic Lines',
    originPort: 'KRPUS',
    destinationPort: 'AEJEA',
    freeZone: false,
    freightAmount: '7400.00',
    currency: 'USD',
    daysAgo: 45,
    treatment: 'STANDARD',
    lines: [
      { description: '55-inch 4K colour LED televisions', quantity: '220', unit: 'PCS', unitPrice: '310.00', weightKg: '4400', hsCode: '852872' },
      { description: 'Split-unit wall air conditioners 1.5 ton', quantity: '150', unit: 'PCS', unitPrice: '265.00', weightKg: '6000', hsCode: '841510' },
    ],
  },
  {
    trackingNumber: `${DEMO_TRACKING_PREFIX}0006`,
    mode: 'AIR',
    status: 'DELIVERED',
    shipperName: 'London MedTech Ltd',
    shipperTrn: null,
    consigneeName: 'Dubai Healthcare Distribution FZ-LLC',
    consigneeTrn: '100789123400003',
    carrierName: 'Skyline Air Cargo',
    originPort: 'GBLHR',
    destinationPort: 'AEDWC',
    freeZone: true,
    freightAmount: '2600.00',
    currency: 'GBP',
    daysAgo: 9,
    treatment: 'EXEMPT',
    lines: [
      { description: 'Laptops 14-inch for clinic records, 1.3 kg', quantity: '60', unit: 'PCS', unitPrice: '640.00', weightKg: '90', hsCode: '847130' },
      { description: 'Network-connected label printers', quantity: '20', unit: 'PCS', unitPrice: '210.00', weightKg: '80', hsCode: '844332' },
    ],
  },
]

/** Escrow split per the spec: 10% at booking, 40% at customs clearance, 50% at delivery. */
export const ESCROW_SPLIT = [
  { kind: 'BOOKING', percentBp: 1000 },
  { kind: 'CUSTOMS_CLEARED', percentBp: 4000 },
  { kind: 'DELIVERED', percentBp: 5000 },
] as const
