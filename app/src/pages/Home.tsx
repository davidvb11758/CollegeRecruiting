import { Link } from 'react-router-dom'
import Completeness from '../components/profile/Completeness'
import { Button, Message } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { dueLabel, formatDate } from '../lib/dates'
import type { Row } from '../lib/listApi'
import { useHome, useActivityTypes } from '../lib/listHooks'
import { stageLabel } from '../lib/listLabels'
import { useProfile } from '../lib/profileHooks'

const text = (v: unknown) => (v == null ? '' : String(v))

const TONE = { overdue: 'text-red-800 font-medium', soon: 'text-amber-800 font-medium', later: 'text-slate-600' } as const

function StepRow({ step }: { step: Row }) {
  const due = dueLabel(text(step.due_date))
  return (
    <li>
      <Link to={`/list/${text(step.list_id)}`} className="flex flex-col rounded border border-slate-300 bg-white p-3 hover:border-red-900">
        <span className="font-medium">{text(step.description)}</span>
        <span className="text-sm text-slate-600">{text(step.college_name)}</span>
        <span className={`text-sm ${TONE[due.tone]}`}>
          {due.text} · {formatDate(text(step.due_date))}
          {step.created_source === 'staff' && <span className="font-normal text-slate-600"> · added by your coordinator</span>}
        </span>
      </Link>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** A1: what needs attention today. Takes an athlete id so the staff area can reuse it. */
export function HomeScreen({ athleteId }: { athleteId: string }) {
  const home = useHome(athleteId)
  const profile = useProfile(athleteId)
  const types = useActivityTypes()
  const typeLabel = (code: unknown) => types.data?.find((t) => t.code === code)?.label ?? ''

  if (home.isPending) {
    return (
      <main className="px-4 py-6">
        <h1 className="mb-2 text-2xl font-semibold">Home</h1>
        <p role="status" className="text-slate-600">
          Loading…
        </p>
      </main>
    )
  }
  if (home.isError || !home.data) {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-semibold">Home</h1>
        <Message kind="error">We could not load your home page. Check your connection and try again.</Message>
        <Button onClick={() => void home.refetch()}>Try again</Button>
      </main>
    )
  }

  const { steps, silent, silentDays, recent, staffNames } = home.data
  const overdue = steps.filter((s) => s.bucket === 'overdue')
  const thisWeek = steps.filter((s) => s.bucket === 'this_week')
  const later = steps.filter((s) => s.bucket === 'later')
  const needsPreferences = profile.data && !profile.data.preference

  return (
    <main className="flex flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Home</h1>

      {profile.data && (
        <section aria-label="Your profile" className="flex flex-col gap-2 rounded border border-slate-300 bg-white p-3">
          <Completeness profile={profile.data} />
          {(profile.data.completeness?.pct ?? 0) < 100 && (
            <Link to="/profile" className="text-sm text-red-900 underline">
              Finish your profile
            </Link>
          )}
          {needsPreferences && (
            <Link to="/preferences" className="text-sm text-red-900 underline">
              Tell us what you are looking for (My College Preferences)
            </Link>
          )}
        </section>
      )}

      {overdue.length > 0 && (
        <Section title="Overdue">
          <ul className="flex flex-col gap-2">
            {overdue.map((s) => (
              <StepRow key={text(s.next_step_id)} step={s} />
            ))}
          </ul>
        </Section>
      )}
      <Section title="Due this week">
        {thisWeek.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {thisWeek.map((s) => (
              <StepRow key={text(s.next_step_id)} step={s} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">{overdue.length > 0 ? 'Nothing else due this week.' : 'Nothing is due this week.'}</p>
        )}
        {later.length > 0 && (
          <p className="text-sm text-slate-600">
            {later.length} more next step{later.length === 1 ? '' : 's'} due later. Open My List to see them.
          </p>
        )}
      </Section>

      {silent.length > 0 && (
        <Section title="No recent contact">
          <p className="text-sm text-slate-600">No activity for {silentDays} days or more.</p>
          <ul className="flex flex-col gap-2">
            {silent.map((e) => (
              <li key={text(e.list_id)}>
                <Link to={`/list/${text(e.list_id)}`} className="flex flex-col rounded border border-slate-300 bg-white p-3 hover:border-red-900">
                  <span className="font-medium">{text(e.college_name)}</span>
                  <span className="text-sm text-slate-600">
                    {stageLabel(e.stage)} · {text(e.days_silent)} days quiet
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent activity">
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600">
            Nothing logged yet.{' '}
            <Link to="/find" className="text-red-900 underline">
              Find colleges
            </Link>{' '}
            to start your list.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((a) => (
              <li key={text(a.id)}>
                <Link to={`/list/${text(a.athlete_college_id)}/activity`} className="flex flex-col rounded border border-slate-300 bg-white p-3 hover:border-red-900">
                  <span className="text-sm text-slate-600">
                    {formatDate(text(a.activity_date))} · {text(a.college_name)}
                    {a.source === 'staff' && ` · added by ${staffNames[text(a.entered_by)] || 'your coordinator'}`}
                  </span>
                  <span className="font-medium">{text(a.summary)}</span>
                  {typeLabel(a.activity_type_code) && <span className="text-sm text-slate-600">{typeLabel(a.activity_type_code)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  )
}

export default function Home() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <HomeScreen athleteId={state.account.athleteId} />
}
