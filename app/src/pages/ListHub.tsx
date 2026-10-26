import { useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import ActivityForm from '../components/list/ActivityForm'
import ActivityTab from '../components/list/ActivityTab'
import ContactsTab from '../components/list/ContactsTab'
import NextStepCard from '../components/list/NextStepCard'
import NextStepForm from '../components/list/NextStepForm'
import OverviewTab from '../components/list/OverviewTab'
import { Button, Message, SecondaryButton } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { placeLabel } from '../lib/collegeLabels'
import { finishNextStep, logFromStep, restoreEntry, type Row } from '../lib/listApi'
import { useListHub, useListWrite, useNextSteps } from '../lib/listHooks'
import { DIVISION_SHORT, priorityLabel, stageLabel } from '../lib/listLabels'
import type { ActivityValues } from '../lib/listSchemas'

type Flow =
  | null
  | { kind: 'log'; entry?: Row; prefill?: Partial<ActivityValues>; fromDone?: boolean }
  | { kind: 'step'; step?: Row }
  | { kind: 'afterDone'; step: Row }
  | { kind: 'afterLog' }

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'activity', label: 'Activity' },
  { to: 'contacts', label: 'Contacts' },
]

/** A8: one college on the athlete's list. Takes an athlete id so the staff area can reuse it. */
export function ListHubScreen({ athleteId, base }: { athleteId: string; base: string }) {
  const { listId = '' } = useParams()
  const hub = useListHub(listId, athleteId)
  const steps = useNextSteps(listId)
  const finish = useListWrite((input: { step: Row; status: 'done' | 'skipped' }) => finishNextStep(String(input.step.id), input.status))
  const restore = useListWrite(() => restoreEntry(listId))
  const [flow, setFlow] = useState<Flow>(null)

  const back = (
    <Link to={base} className="flex min-h-11 items-center text-red-900 underline">
      ← My List
    </Link>
  )
  if (hub.isPending) {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        {back}
        <p role="status" className="text-slate-600">
          Loading…
        </p>
      </main>
    )
  }
  if (hub.isError || !hub.data) {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        {back}
        <Message kind="error">{hub.isError ? 'We could not load this college. Check your connection and try again.' : 'That college is not on your list.'}</Message>
        {hub.isError && <Button onClick={() => void hub.refetch()}>Try again</Button>}
      </main>
    )
  }

  const { entry, summary, coaches } = hub.data
  const openStep = (steps.data ?? []).find((s) => s.status === 'open')
  const afterLog = (followUp: boolean, fromDone?: boolean) => setFlow(!openStep && (followUp || fromDone) ? { kind: 'afterLog' } : null)

  if (flow?.kind === 'log') {
    return (
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">{String(summary.college_name)}</h1>
        <ActivityForm
          athleteId={athleteId}
          listId={listId}
          coaches={coaches}
          entry={flow.entry}
          prefill={flow.prefill}
          onSaved={({ followUp }) => afterLog(followUp, flow.fromDone)}
          onCancel={() => setFlow(flow.fromDone ? { kind: 'afterLog' } : null)}
        />
      </main>
    )
  }
  if (flow?.kind === 'step') {
    return (
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">{String(summary.college_name)}</h1>
        <NextStepForm athleteId={athleteId} listId={listId} step={flow.step} onSaved={() => setFlow(null)} onCancel={() => setFlow(null)} />
      </main>
    )
  }

  const mainCoach = coaches.find((c) => c.id === entry.main_coach_id)
  const archived = entry.archived_at != null

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      {back}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{String(summary.college_name)}</h1>
        <p className="text-slate-600">
          {[placeLabel(summary.city, summary.state), DIVISION_SHORT[String(summary.division_code)] ?? ''].filter(Boolean).join(' · ')}
        </p>
        <p className="flex flex-wrap gap-2 text-sm">
          <span className="rounded bg-slate-200 px-2 py-0.5">Priority {priorityLabel(entry.priority)}</span>
          <span className="rounded bg-slate-200 px-2 py-0.5">{stageLabel(entry.stage)}</span>
        </p>
        {mainCoach && (
          <p className="text-sm text-slate-600">
            Main contact: {String(mainCoach.full_name)}
            {typeof mainCoach.email === 'string' && mainCoach.email && (
              <>
                {' · '}
                <a href={`mailto:${mainCoach.email}`} className="text-red-900 underline">
                  {mainCoach.email}
                </a>
              </>
            )}
          </p>
        )}
        <Link to={`/find/${String(entry.program_id)}`} className="flex min-h-11 items-center text-sm text-red-900 underline">
          View college details
        </Link>
      </header>

      {archived && (
        <div className="flex flex-col gap-2">
          <Message kind="info">This college is removed from your list.</Message>
          {restore.error && <Message kind="error">{restore.error}</Message>}
          <Button disabled={restore.pending} onClick={() => void restore.run(undefined).catch(() => undefined)}>
            Restore to My List
          </Button>
        </div>
      )}

      {flow?.kind === 'afterDone' && (
        <section aria-label="Log it" className="flex flex-col gap-2 rounded border border-slate-300 bg-white p-3">
          <p className="font-medium">Marked done. Log it?</p>
          <p className="text-sm text-slate-600">A log entry keeps the full story of this college.</p>
          <Button type="button" onClick={() => setFlow({ kind: 'log', prefill: logFromStep(flow.step), fromDone: true })}>
            Log it
          </Button>
          <SecondaryButton type="button" onClick={() => afterLog(false, true)}>
            Not now
          </SecondaryButton>
        </section>
      )}
      {flow?.kind === 'afterLog' && !openStep && (
        <section aria-label="Set the next step" className="flex flex-col gap-2 rounded border border-slate-300 bg-white p-3">
          <p className="font-medium">What is the next step?</p>
          <Button type="button" onClick={() => setFlow({ kind: 'step' })}>
            Set next step
          </Button>
          <SecondaryButton type="button" onClick={() => setFlow(null)}>
            Not now
          </SecondaryButton>
        </section>
      )}

      {finish.error && <Message kind="error">{finish.error}</Message>}
      {!archived && (
        <NextStepCard
          step={openStep}
          busy={finish.pending}
          onSet={() => setFlow({ kind: 'step' })}
          onEdit={() => setFlow({ kind: 'step', step: openStep })}
          onDone={() => openStep && void finish.run({ step: openStep, status: 'done' }).then(() => setFlow({ kind: 'afterDone', step: openStep }), () => undefined)}
          onSkip={() => openStep && void finish.run({ step: openStep, status: 'skipped' }).then(() => setFlow({ kind: 'afterLog' }), () => undefined)}
        />
      )}

      <nav aria-label="College sections" className="flex border-b border-slate-300">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={`${base}/${listId}/${t.to}`}
            className={({ isActive }) =>
              `flex min-h-11 flex-1 items-center justify-center text-sm ${isActive ? 'border-b-2 border-red-900 font-semibold text-red-900' : 'text-slate-600'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewTab listId={listId} hub={hub.data} />} />
        <Route
          path="activity"
          element={<ActivityTab listId={listId} coaches={coaches} onLog={() => setFlow({ kind: 'log' })} onEdit={(e) => setFlow({ kind: 'log', entry: e })} />}
        />
        <Route path="contacts" element={<ContactsTab listId={listId} athleteId={athleteId} hub={hub.data} />} />
      </Routes>
    </main>
  )
}

export default function ListHub() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <ListHubScreen athleteId={state.account.athleteId} base="/list" />
}
