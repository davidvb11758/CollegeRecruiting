import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Message, SelectField } from '../components/ui'
import { clubToday, diffDays, formatDate } from '../lib/dates'
import type { Row } from '../lib/dbClient'
import { matchesName, ROSTER_SORTS, sortRoster, type RosterSort } from '../lib/rosterSort'
import { staffAthletePrefix } from '../lib/scope'
import { useRoster } from '../lib/staffHooks'

const text = (v: unknown) => (v == null ? '' : String(v))

function lastActivityText(date: unknown): string {
  if (date == null) return 'No activity yet'
  const days = diffDays(clubToday(), text(date))
  return `Last activity ${formatDate(text(date))} (${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`})`
}

function AthleteCard({ row }: { row: Row }) {
  const overdue = Number(row.overdue_count)
  const pct = Number(row.profile_pct)
  return (
    <li>
      <Link
        to={staffAthletePrefix(text(row.athlete_id))}
        className="flex flex-col gap-1 rounded border border-slate-300 bg-white p-3 hover:border-red-900"
      >
        <span className="font-medium">
          {text(row.first_name)} {text(row.last_name)}
        </span>
        <span className="text-sm text-slate-600">
          {text(row.team_name)} · Class of {text(row.graduation_year)}
        </span>
        <span className="flex flex-wrap gap-2 text-sm">
          <span className="rounded bg-slate-200 px-2 py-0.5">Profile {pct}%</span>
          <span className="rounded bg-slate-200 px-2 py-0.5">
            {Number(row.colleges_count)} college{Number(row.colleges_count) === 1 ? '' : 's'}
          </span>
          {overdue > 0 && <span className="rounded bg-red-900 px-2 py-0.5 text-white">{overdue} overdue</span>}
        </span>
        <span className="text-sm text-slate-600">{lastActivityText(row.last_activity_date)}</span>
      </Link>
    </li>
  )
}

/** S1: the coordinator's athletes. Row-level security decides who is on it; the page only searches and sorts. */
export default function Roster() {
  const roster = useRoster()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sortParam = params.get('sort') ?? ''
  const sort: RosterSort = ROSTER_SORTS.some((s) => s.value === sortParam) ? (sortParam as RosterSort) : 'name'

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const all = useMemo(() => roster.data ?? [], [roster.data])
  const shown = useMemo(() => sortRoster(all.filter((r) => matchesName(r, q)), sort), [all, q, sort])
  const overdueTotal = all.reduce((sum, r) => sum + Number(r.overdue_count), 0)

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Roster</h1>
      {roster.isPending ? (
        <p role="status" className="text-slate-600">
          Loading…
        </p>
      ) : roster.isError ? (
        <div className="flex flex-col gap-3">
          <Message kind="error">We could not load the roster. Check your connection and try again.</Message>
          <Button onClick={() => void roster.refetch()}>Try again</Button>
        </div>
      ) : all.length === 0 ? (
        <p className="text-slate-600">No athletes are assigned to you yet. Ask the administrator to assign athletes to you.</p>
      ) : (
        <>
          <p role="status" className="text-sm text-slate-600">
            {all.length} athlete{all.length === 1 ? '' : 's'}
            {overdueTotal > 0 ? ` · ${overdueTotal} overdue next step${overdueTotal === 1 ? '' : 's'}` : ''}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="roster-search" className="text-sm font-medium">
                Search by name
              </label>
              <input
                id="roster-search"
                type="search"
                value={q}
                onChange={(e) => set('q', e.target.value)}
                className="min-h-11 rounded border border-slate-400 bg-white px-3 text-base"
              />
            </div>
            <SelectField label="Sort by" options={[...ROSTER_SORTS]} value={sort} onChange={(e) => set('sort', e.target.value === 'name' ? '' : e.target.value)} />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-600">No athlete matches that name.</p>
          ) : (
            <ul aria-label="Athletes" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown.map((r) => (
                <AthleteCard key={text(r.athlete_id)} row={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
