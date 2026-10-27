import type { ReactNode } from 'react'
import { useState } from 'react'
import { coachTitleLabel } from '../lib/collegeLabels'
import type { Row } from '../lib/dbClient'
import { useScope } from '../lib/scope'
import { SecondaryButton } from './ui'

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export function CopyButton({ value, what }: { value: string; what: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }
  return (
    <span className="flex items-center gap-2">
      <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => void copy()} aria-label={`Copy ${what}`}>
        Copy
      </SecondaryButton>
      <span role="status" className="text-sm text-slate-600">
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Could not copy. Select the text instead.' : ''}
      </span>
    </span>
  )
}


/** A college coach's contact details with tap-to-email, tap-to-call and Copy. `actions` adds buttons under the details. */
export default function CoachCard({ coach, badge, actions }: { coach: Row; badge?: ReactNode; actions?: ReactNode }) {
  const { staffView } = useScope()
  const email = text(coach.email)
  const phone = text(coach.phone)
  return (
    <li className="flex flex-col gap-1 rounded border border-slate-300 bg-white p-3">
      <span className="font-medium">
        {text(coach.full_name)}
        {coach.owner_athlete_id != null && <span className="ml-2 text-xs font-normal text-slate-600">({staffView ? 'added by the athlete' : 'added by you'})</span>}
      </span>
      <span className="text-sm text-slate-600">
        {coachTitleLabel(coach.title)}
        {coach.is_primary_recruiting_contact === true && ' · Main recruiting contact'}
      </span>
      {badge}
      {email && (
        <span className="flex flex-wrap items-center gap-x-3">
          <a href={`mailto:${email}`} className="flex min-h-11 items-center break-all text-red-900 underline">
            {email}
          </a>
          <CopyButton value={email} what={`email for ${text(coach.full_name)}`} />
        </span>
      )}
      {phone && (
        <span className="flex flex-wrap items-center gap-x-3">
          <a href={`tel:${phone}`} className="flex min-h-11 items-center text-red-900 underline">
            {phone}
          </a>
          <CopyButton value={phone} what={`phone for ${text(coach.full_name)}`} />
        </span>
      )}
      {text(coach.recruits_note) && <span className="text-sm text-slate-600">{text(coach.recruits_note)}</span>}
      {text(coach.staff_page_url) && (
        <a href={text(coach.staff_page_url)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-red-900 underline">
          Staff page
        </a>
      )}
      {actions}
    </li>
  )
}

