import { z } from 'zod'

/** Form fields hold text; these helpers check the text and turn it into what the database stores. */

export const str = (v: unknown): string => (v == null ? '' : String(v))

export const blankToNull = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export const numOrNull = (v: string): number | null => {
  const t = v.trim()
  return t === '' ? null : Number(t)
}

export const intField = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `${label} must be a whole number from ${min} to ${max}`)

export const decimalField = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= min && Number(v) <= max),
      `${label} must be a number from ${min} to ${max} (up to 2 decimals)`,
    )

export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address')

export const optionalUrl = z
  .string()
  .trim()
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Start the link with http:// or https://')

export const requiredUrl = z
  .string()
  .trim()
  .min(1, 'Enter the link')
  .refine((v) => /^https?:\/\/\S+$/i.test(v), 'Start the link with http:// or https://')

export const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), 'Enter a valid date')

export const maxText = (label: string, max: number) =>
  z.string().max(max, `${label} can be at most ${max} characters`)

/** Today as YYYY-MM-DD in the browser's time zone. */
export function todayString(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD day (same rule as the database). */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, d] = day.split('-').map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

/** This year and the next six, for the graduation year pick-list. A saved year outside that range stays selectable. */
export function graduationYears(now: Date = new Date(), keep = ''): { value: string; label: string }[] {
  const first = now.getFullYear()
  const years = Array.from({ length: 7 }, (_, i) => String(first + i))
  if (/^\d{4}$/.test(keep) && !years.includes(keep)) years.unshift(keep)
  return years.sort().map((y) => ({ value: y, label: y }))
}
