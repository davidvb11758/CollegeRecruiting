import { dueLabel, formatDate } from '../../lib/dates'
import type { Row } from '../../lib/listApi'
import { Button, OutlineButton, SecondaryButton } from '../ui'

const TONE = {
  overdue: 'text-danger font-medium',
  soon: 'text-gold font-medium',
  later: 'text-muted',
} as const

/** The one open next step for a college, with Done, Skip and Change. Shows a prompt when there is none. */
export default function NextStepCard({
  step,
  busy,
  onSet,
  onEdit,
  onDone,
  onSkip,
}: {
  step: Row | undefined
  busy: boolean
  onSet: () => void
  onEdit: () => void
  onDone: () => void
  onSkip: () => void
}) {
  if (!step) {
    return (
      <section aria-label="Next step" className="flex flex-col gap-2 rounded border border-dashed border-edge bg-surface p-3">
        <p className="text-sm text-muted">No next step yet. A reminder keeps this college moving.</p>
        <OutlineButton type="button" onClick={onSet}>
          Set a next step
        </OutlineButton>
      </section>
    )
  }
  const due = dueLabel(String(step.due_date))
  return (
    <section aria-label="Next step" className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      <p className="text-sm text-muted">Next step</p>
      <p className="font-medium">{String(step.description)}</p>
      <p className={`text-sm ${TONE[due.tone]}`}>
        {due.text} · {formatDate(String(step.due_date))}
        {step.created_source === 'staff' && <span className="font-normal text-muted"> · added by your coordinator</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={onDone} className="min-h-10">
          Done
        </Button>
        <SecondaryButton type="button" disabled={busy} onClick={onEdit} className="min-h-10">
          Change
        </SecondaryButton>
        <SecondaryButton type="button" disabled={busy} onClick={onSkip} className="min-h-10">
          Skip
        </SecondaryButton>
      </div>
    </section>
  )
}
