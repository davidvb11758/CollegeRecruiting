import { useMemo, useState } from 'react'
import { Button, Message, SecondaryButton, SelectField } from '../components/ui'
import { assignAthlete, removeAssignment, setAssignmentRole, type Assignment, type Coordinator } from '../lib/assignApi'
import { useAssignmentData, useAssignmentWrite } from '../lib/assignHooks'
import type { Row } from '../lib/dbClient'
import { matchesName } from '../lib/rosterSort'

const text = (v: unknown) => (v == null ? '' : String(v))

function AthleteCard({ athlete, assignments, coordinators }: { athlete: Row; assignments: Assignment[]; coordinators: Coordinator[] }) {
  const name = `${text(athlete.first_name)} ${text(athlete.last_name)}`
  const [choice, setChoice] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const add = useAssignmentWrite(assignAthlete)
  const change = useAssignmentWrite(setAssignmentRole)
  const remove = useAssignmentWrite(removeAssignment)
  const busy = add.pending || change.pending || remove.pending

  const nameOf = (id: string) => coordinators.find((c) => c.userId === id)?.name || 'Unknown coordinator'
  const assigned = new Set(assignments.map((a) => a.staffUserId))
  const offered = coordinators.filter((c) => c.available && !assigned.has(c.userId))
  const hasMain = assignments.some((a) => a.role === 'primary')
  const ordered = [...assignments].sort((a, b) => (a.role === b.role ? nameOf(a.staffUserId).localeCompare(nameOf(b.staffUserId)) : a.role === 'primary' ? -1 : 1))

  return (
    <li className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted">
          {text(athlete.team_name)} · Class of {text(athlete.graduation_year)}
        </p>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-gold">No coordinator yet. Nobody on staff can see {name}.</p>
      ) : (
        <ul aria-label={`Coordinators of ${name}`} className="flex flex-col gap-2">
          {ordered.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <span>{nameOf(a.staffUserId)}</span>
              <span className="rounded bg-line px-2 py-0.5 text-sm">{a.role === 'primary' ? 'Main' : 'Extra'}</span>
              {coordinators.find((c) => c.userId === a.staffUserId)?.available === false && <span className="text-sm text-muted">(account off)</span>}
              {confirming === a.id ? (
                <>
                  <Button
                    type="button"
                    className="min-h-9 px-3 text-sm"
                    disabled={busy}
                    onClick={() => void remove.run(a.id).then(() => setConfirming(null), () => undefined)}
                  >
                    Yes, remove
                  </Button>
                  <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(null)}>
                    Keep
                  </SecondaryButton>
                </>
              ) : (
                <>
                  {a.role === 'secondary' && (
                    <SecondaryButton
                      type="button"
                      className="min-h-9 px-3 text-sm"
                      disabled={busy}
                      aria-label={`Make ${nameOf(a.staffUserId)} the main coordinator of ${name}`}
                      onClick={() => void change.run({ id: a.id, role: 'primary' }).catch(() => undefined)}
                    >
                      Make main
                    </SecondaryButton>
                  )}
                  <SecondaryButton
                    type="button"
                    className="min-h-9 px-3 text-sm"
                    disabled={busy}
                    aria-label={`Remove ${nameOf(a.staffUserId)} from ${name}`}
                    onClick={() => setConfirming(a.id)}
                  >
                    Remove
                  </SecondaryButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming && <p className="text-sm text-muted">They will no longer see {name} or the conversation with {name}.</p>}

      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Add a coordinator for ${name}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded border border-edge bg-surface px-2 text-base"
          >
            <option value="">{hasMain ? 'Add an extra coordinator…' : 'Choose the main coordinator…'}</option>
            {offered.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!choice || busy}
            aria-label={`Assign to ${name}`}
            onClick={() => void add.run({ athleteId: text(athlete.athlete_id), staffUserId: choice, role: hasMain ? 'secondary' : 'primary' }).then(() => setChoice(''), () => undefined)}
          >
            Assign
          </Button>
        </div>
      )}
      {(add.error || change.error || remove.error) && <Message kind="error">{add.error || change.error || remove.error}</Message>}
    </li>
  )
}

/** Administrators only: who looks after which athlete. A coordinator sees only the athletes assigned to them. */
export default function Assignments() {
  const data = useAssignmentData()
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'all' | 'none'>('all')

  const byAthlete = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of data.data?.assignments ?? []) map.set(a.athleteId, [...(map.get(a.athleteId) ?? []), a])
    return map
  }, [data.data])
  const athletes = useMemo(() => data.data?.athletes ?? [], [data.data])
  const without = athletes.filter((a) => !byAthlete.has(text(a.athlete_id))).length
  const shown = athletes.filter((a) => matchesName(a, q) && (show === 'all' || !byAthlete.has(text(a.athlete_id))))

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Assignments</h1>
      <p className="text-sm text-muted">
        Each athlete has one main coordinator and may have extra ones. A coordinator sees only the athletes assigned to them. Changes take effect at once.
      </p>
      {data.isPending ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : data.isError ? (
        <div className="flex flex-col gap-3">
          <Message kind="error">We could not load the assignments. Check your connection and try again.</Message>
          <Button onClick={() => void data.refetch()}>Try again</Button>
        </div>
      ) : athletes.length === 0 ? (
        <p className="text-muted">No athlete has created a profile yet.</p>
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            {athletes.length} athlete{athletes.length === 1 ? '' : 's'} · {without} without a coordinator
          </p>
          {data.data.coordinators.every((c) => !c.available) && (
            <Message kind="info">There is no active coordinator to assign yet. Promote a signed-up person to staff first (see the administrator runbook).</Message>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="assign-search" className="text-sm font-medium">
                Search by name
              </label>
              <input
                id="assign-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-h-11 rounded border border-edge bg-surface px-3 text-base"
              />
            </div>
            <SelectField
              label="Show"
              value={show}
              onChange={(e) => setShow(e.target.value === 'none' ? 'none' : 'all')}
              options={[
                { value: 'all', label: 'All athletes' },
                { value: 'none', label: 'Only athletes without a coordinator' },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">{show === 'none' && !q ? 'Every athlete has a coordinator.' : 'No athlete matches.'}</p>
          ) : (
            <ul aria-label="Athletes" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {shown.map((a) => (
                <AthleteCard key={text(a.athlete_id)} athlete={a} assignments={byAthlete.get(text(a.athlete_id)) ?? []} coordinators={data.data.coordinators} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}
