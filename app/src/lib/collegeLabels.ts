const CONTROL: Record<string, string> = {
  public: 'Public',
  private_nonprofit: 'Private',
  private_for_profit: 'Private (for-profit)',
}
const SETTING: Record<string, string> = { urban: 'City', suburban: 'Suburb', rural: 'Rural' }
const SELECTIVITY: Record<string, string> = {
  highly_selective: 'Highly selective',
  selective: 'Selective',
  moderately_selective: 'Moderately selective',
  open: 'Open admission',
}
const SIZE: Record<string, string> = { small: 'Small', medium: 'Medium', large: 'Large' }
const COACH_TITLE: Record<string, string> = {
  head: 'Head coach',
  associate_head: 'Associate head coach',
  assistant: 'Assistant coach',
  recruiting_coordinator: 'Recruiting coordinator',
  director_ops: 'Director of operations',
  other: 'Staff',
}

const label = (map: Record<string, string>, value: unknown) => (typeof value === 'string' ? (map[value] ?? '') : '')

export const controlLabel = (v: unknown) => label(CONTROL, v)
export const settingLabel = (v: unknown) => label(SETTING, v)
export const selectivityLabel = (v: unknown) => label(SELECTIVITY, v)
export const sizeLabel = (v: unknown) => label(SIZE, v)
export const coachTitleLabel = (v: unknown) => label(COACH_TITLE, v)

/** "Level 2" for a competitiveness band, or "" when the program has no rank. */
export function bandLabel(band: unknown): string {
  const n = Number(band)
  if (!Number.isInteger(n) || n < 1 || n > 6) return ''
  return n === 1 ? 'Level 1 (top 10%)' : n === 6 ? 'Level 6 (lower half)' : `Level ${n}`
}

export const formatNumber = (v: unknown): string => (v == null || v === '' ? '' : Number(v).toLocaleString('en-US'))

export const formatMoney = (v: unknown): string => (v == null || v === '' ? '' : `$${Number(v).toLocaleString('en-US')}`)

export const formatPercent = (v: unknown): string => (v == null || v === '' ? '' : `${Math.round(Number(v) * 100)}%`)

/** "Des Moines, IA", leaving out whatever is missing. */
export const placeLabel = (city: unknown, state: unknown): string => [city, state].filter((x) => typeof x === 'string' && x !== '').join(', ')

/** Whole days between a YYYY-MM-DD date and today, for the "last verified" line. */
export function daysSince(date: string, now: Date = new Date()): number {
  const [y, m, d] = date.split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((today - then) / 86_400_000))
}
