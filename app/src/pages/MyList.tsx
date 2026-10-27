import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Message, SelectField } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { placeLabel } from '../lib/collegeLabels'
import { dueLabel, formatDate } from '../lib/dates'
import type { Row } from '../lib/listApi'
import { useMyList } from '../lib/listHooks'
import { DIVISION_SHORT, PRIORITY_OPTIONS, priorityLabel, SETTLED_STAGES, STAGE_OPTIONS, stageLabel } from '../lib/listLabels'
import { SORTS, sortList, type SortKey } from '../lib/listSort'
import { useScope } from '../lib/scope'

const ago = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`)
const text = (v: unknown) => (v == null ? '' : String(v))

function ListCard({ row, base }: { row: Row; base: string }) {
  const due = row.next_step_due_date ? dueLabel(text(row.next_step_due_date)) : null
  const settled = SETTLED_STAGES.includes(text(row.stage))
  const silent = Number(row.days_silent)
  return (
    <li>
      <Link to={`${base}/${text(row.list_id)}`} className="flex flex-col gap-1 rounded border border-slate-300 bg-white p-3 hover:border-red-900">
        <span className="font-medium">{text(row.college_name)}</span>
        <span className="text-sm text-slate-600">
          {[placeLabel(row.city, row.state), DIVISION_SHORT[text(row.division_code)] ?? ''].filter(Boolean).join(' · ')}
        </span>
        <span className="flex flex-wrap gap-2 text-sm">
          <span className="rounded bg-slate-200 px-2 py-0.5">Priority {priorityLabel(row.priority)}</span>
          <span className="rounded bg-slate-200 px-2 py-0.5">{stageLabel(row.stage)}</span>
          {row.archived_at != null && <span className="rounded bg-slate-700 px-2 py-0.5 text-white">Removed</span>}
        </span>
        {due && !row.archived_at && (
          <span className={`text-sm ${due.tone === 'overdue' ? 'font-medium text-red-800' : due.tone === 'soon' ? 'font-medium text-amber-800' : 'text-slate-600'}`}>
            {text(row.next_step_description)} · {due.text} ({formatDate(text(row.next_step_due_date))})
          </span>
        )}
        {!settled && !row.archived_at && (
          <span className="text-sm text-slate-600">
            {row.last_activity_date
              ? `Last activity ${formatDate(text(row.last_activity_date))} (${ago(silent)})`
              : `No activity yet · added ${formatDate(text(row.added_on))}`}
          </span>
        )}
      </Link>
    </li>
  )
}

/** A7: the athlete's colleges, with stage and priority filters and sorting. Filters live in the page address. */
export function MyListScreen({ athleteId, base }: { athleteId: string; base: string }) {
  const { prefix } = useScope()
  const [params, setParams] = useSearchParams()
  const list = useMyList(athleteId)
  const stage = params.get('stage') ?? ''
  const priority = params.get('priority') ?? ''
  const sortParam = params.get('sort') ?? ''
  const sort: SortKey = SORTS.some((s) => s.value === sortParam) ? (sortParam as SortKey) : 'priority'
  const showRemoved = params.get('removed') === '1'

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const all = list.data ?? []
  const active = all.filter((r) => r.archived_at == null)
  const removed = all.filter((r) => r.archived_at != null)
  const shown = useMemo(
    () =>
      sortList(
        (showRemoved ? removed : active).filter((r) => (!stage || r.stage === stage) && (!priority || String(r.priority) === priority)),
        sort,
      ),
    [active, removed, showRemoved, stage, priority, sort],
  )

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">My List</h1>
      {list.isPending ? (
        <p role="status" className="text-slate-600">
          Loading…
        </p>
      ) : list.isError ? (
        <div className="flex flex-col gap-3">
          <Message kind="error">We could not load your list. Check your connection and try again.</Message>
          <Button onClick={() => void list.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <p role="status" className="text-sm text-slate-600">
            {active.length} of 30 colleges
          </p>
          {all.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-slate-600">Your list is empty. Search the database and add the colleges you want to consider. Start with 20 to 30, then narrow to the 10 to 15 you will contact.</p>
              <Link to={`${prefix}/find`} className="min-h-11 rounded bg-red-900 px-4 py-2.5 text-center font-medium text-white">
                Find Colleges
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SelectField label="Stage" placeholder="All stages" options={STAGE_OPTIONS} value={stage} onChange={(e) => set('stage', e.target.value)} />
                <SelectField label="Priority" placeholder="All priorities" options={PRIORITY_OPTIONS} value={priority} onChange={(e) => set('priority', e.target.value)} />
                <SelectField label="Sort by" options={[...SORTS]} value={sort} onChange={(e) => set('sort', e.target.value === 'priority' ? '' : e.target.value)} />
              </div>
              {removed.length > 0 && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5" checked={showRemoved} onChange={(e) => set('removed', e.target.checked ? '1' : '')} />
                  Show colleges I removed ({removed.length})
                </label>
              )}
              {shown.length === 0 ? (
                <p className="text-sm text-slate-600">{stage || priority ? 'No colleges match these filters.' : 'Nothing to show.'}</p>
              ) : (
                <ul aria-label="My colleges" className="flex flex-col gap-2">
                  {shown.map((r) => (
                    <ListCard key={text(r.list_id)} row={r} base={base} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

export default function MyList() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <MyListScreen athleteId={state.account.athleteId} base="/list" />
}
