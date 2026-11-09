/**
 * RFC 4180 CSV with formula-injection protection: cells beginning with
 * = + - @ or a tab/CR are prefixed with an apostrophe so spreadsheet apps
 * treat them as text (OWASP "CSV Injection"). Plain negative numbers such as
 * "-12.50" are left alone so amounts stay numeric.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/
const DANGEROUS = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'bigint' ? value.toString() : String(value)
  if (DANGEROUS.test(s) && !NUMERIC.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: Array<{ header: string; value: (row: T) => unknown }>): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','))
  return `${lines.join('\r\n')}\r\n`
}
