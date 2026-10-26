import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Button, Message, SecondaryButton } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { useAddToList, useCollegeDetail, useListEntries } from '../lib/collegeHooks'
import {
  bandLabel,
  coachTitleLabel,
  controlLabel,
  daysSince,
  formatMoney,
  formatNumber,
  formatPercent,
  placeLabel,
  selectivityLabel,
  settingLabel,
  sizeLabel,
} from '../lib/collegeLabels'
import type { Row } from '../lib/profileApi'

const text = (v: unknown) => (typeof v === 'string' ? v : '')

function CopyButton({ value, what }: { value: string; what: string }) {
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

function ExternalLink({ href, children }: { href: unknown; children: string }) {
  const url = text(href)
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-red-900 underline">
      {children}
    </a>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <>
      <dt className="text-slate-600">{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function CoachCard({ coach }: { coach: Row }) {
  const email = text(coach.email)
  const phone = text(coach.phone)
  return (
    <li className="flex flex-col gap-1 rounded border border-slate-300 bg-white p-3">
      <span className="font-medium">
        {text(coach.full_name)}
        {coach.owner_athlete_id != null && <span className="ml-2 text-xs font-normal text-slate-600">(added by you)</span>}
      </span>
      <span className="text-sm text-slate-600">
        {coachTitleLabel(coach.title)}
        {coach.is_primary_recruiting_contact === true && ' · Main recruiting contact'}
      </span>
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
      <ExternalLink href={coach.staff_page_url}>Staff page</ExternalLink>
    </li>
  )
}

function AddToList({ athleteId, programId }: { athleteId: string | null; programId: number }) {
  const entries = useListEntries(athleteId)
  const { add, adding, added, error } = useAddToList(athleteId ?? '')
  const [firstAdd, setFirstAdd] = useState(false)
  if (!athleteId) {
    return <Message kind="info">To add this college to an athlete's list, open that athlete first.</Message>
  }
  if (entries.isPending) return null
  const entry = (entries.data ?? []).find((e) => e.program_id === programId)
  const onList = entry && !entry.archived_at
  if (onList && !added) {
    return (
      <p className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-red-900 px-2 py-1 text-sm font-medium text-white">On My List</span>
        <Link to="/list" className="text-red-900 underline">
          Go to My List
        </Link>
      </p>
    )
  }
  if (added) {
    return (
      <div className="flex flex-col gap-2">
        <Message kind="info">Added to My List.</Message>
        {firstAdd && (
          <Message kind="info">Tip: start with 20 to 30 colleges, then narrow to the 10 to 15 you will contact.</Message>
        )}
        <Link to="/list" className="text-red-900 underline">
          Go to My List
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {error && <Message kind="error">{error}</Message>}
      <Button
        disabled={adding}
        onClick={() => {
          setFirstAdd((entries.data ?? []).filter((e) => !e.archived_at).length === 0)
          void add({ programId, archivedEntryId: entry?.id }).catch(() => undefined)
        }}
      >
        {adding ? 'Adding…' : entry ? 'Restore to My List' : 'Add to My List'}
      </Button>
    </div>
  )
}

/** A5: one college's facts, program links and coach contacts, with Add to My List. */
export function CollegeDetailScreen({ base, athleteId }: { base: string; athleteId: string | null }) {
  const { programId: param } = useParams()
  const location = useLocation()
  const programId = Number(param)
  const detail = useCollegeDetail(programId, athleteId)
  const back = `${base}${(location.state as { search?: string } | null)?.search ?? ''}`

  const backLink = (
    <Link to={back} className="flex min-h-11 items-center text-red-900 underline">
      ← Back to Find Colleges
    </Link>
  )
  if (!Number.isInteger(programId)) return <main className="px-4 py-6">{backLink}<Message kind="error">That college was not found.</Message></main>
  if (detail.isPending) return <main className="px-4 py-6"><p role="status" className="text-slate-600">Loading…</p></main>
  if (detail.isError) {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        {backLink}
        <Message kind="error">We could not load this college. Check your connection and try again.</Message>
        <Button onClick={() => void detail.refetch()}>Try again</Button>
      </main>
    )
  }
  if (!detail.data) return <main className="flex flex-col gap-3 px-4 py-6">{backLink}<Message kind="error">That college was not found.</Message></main>

  const { program, programExtra, college, coaches } = detail.data
  const verified = text(program.last_verified_on)
  const days = verified ? daysSince(verified) : null
  const level = bandLabel(program.competitiveness_band)
  const tuition = [
    program.tuition_in_state != null && `${formatMoney(program.tuition_in_state)} in-state`,
    program.tuition_out_state != null && `${formatMoney(program.tuition_out_state)} out-of-state`,
  ].filter(Boolean)

  return (
    <main className="flex flex-col gap-5 px-4 py-6">
      {backLink}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{text(program.college_name)}</h1>
        <p className="text-slate-600">
          {[placeLabel(program.city, program.state), text(program.division_label), text(program.conference)].filter(Boolean).join(' · ')}
        </p>
      </header>

      <AddToList athleteId={athleteId} programId={programId} />

      <section aria-labelledby="facts" className="flex flex-col gap-2">
        <h2 id="facts" className="text-lg font-semibold">
          About the school
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <Fact label="Public or private" value={controlLabel(program.control)} />
          <Fact label="Setting" value={settingLabel(program.campus_setting)} />
          <Fact label="Students" value={[formatNumber(program.enrollment), sizeLabel(program.size_band) && `(${sizeLabel(program.size_band).toLowerCase()})`].filter(Boolean).join(' ')} />
          <Fact label="Admission" value={[selectivityLabel(program.selectivity), formatPercent(college.admit_rate) && `${formatPercent(college.admit_rate)} admitted`].filter(Boolean).join(', ')} />
          <Fact label="Tuition" value={tuition.join(', ') + (text(college.tuition_year) ? ` (${text(college.tuition_year)})` : '')} />
          <Fact label="Affiliation" value={text(college.religious_affiliation)} />
        </dl>
      </section>

      <section aria-labelledby="program" className="flex flex-col gap-2">
        <h2 id="program" className="text-lg font-semibold">
          Volleyball program
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <Fact label="Program level" value={level && program.division_rank != null ? `${level}, ranked ${program.division_rank} in its division` : level} />
          <Fact label="Last season" value={text(programExtra.last_season_record)} />
        </dl>
        <div className="flex flex-col">
          <ExternalLink href={program.program_url}>Volleyball program page</ExternalLink>
          <ExternalLink href={program.questionnaire_url}>Recruiting questionnaire</ExternalLink>
          <ExternalLink href={programExtra.camps_url}>Camps</ExternalLink>
          <ExternalLink href={program.website_url}>College website</ExternalLink>
          <ExternalLink href={program.cost_url}>Cost of attendance</ExternalLink>
          <ExternalLink href={programExtra.instagram_url}>Instagram</ExternalLink>
          <ExternalLink href={programExtra.x_url}>X (Twitter)</ExternalLink>
        </div>
      </section>

      <section aria-labelledby="coaches" className="flex flex-col gap-2">
        <h2 id="coaches" className="text-lg font-semibold">
          Coaches
        </h2>
        {coaches.length === 0 ? (
          <p className="text-sm text-slate-600">No coach contacts are listed for this program yet. Check the program page above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {coaches.map((c) => (
              <CoachCard key={String(c.id)} coach={c} />
            ))}
          </ul>
        )}
      </section>

      {verified && (
        <p className="text-sm text-slate-600">
          Last verified {verified}
          {days !== null && days > 0 ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''}. Contact details change; check the program page before you write.
        </p>
      )}
    </main>
  )
}

export default function CollegeDetail() {
  const { state } = useAuth()
  const athleteId = state.status === 'signedIn' ? state.account.athleteId : null
  return <CollegeDetailScreen base="/find" athleteId={athleteId} />
}

export function StaffCollegeDetail() {
  return <CollegeDetailScreen base="/staff/find" athleteId={null} />
}
