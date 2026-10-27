import { useState } from 'react'
import { formatDate } from '../../lib/dates'
import { deleteActivity, type Row } from '../../lib/listApi'
import { useActivity, useActivityTypes, useListWrite } from '../../lib/listHooks'
import { directionLabel, outcomeLabel } from '../../lib/listLabels'
import { useScope } from '../../lib/scope'
import { Button, Message, SecondaryButton } from '../ui'

function Entry({ entry, typeLabel, coachName, onEdit }: { entry: Row; typeLabel: string; coachName: string; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useListWrite((id: string) => deleteActivity(id))
  const { staffView } = useScope()
  const system = entry.source === 'system'
  const meta = [typeLabel, directionLabel(entry.direction), coachName, outcomeLabel(entry.outcome)].filter(Boolean)
  return (
    <li className={`flex flex-col gap-1 rounded border p-3 ${system ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`}>
      <p className="text-sm text-slate-600">
        {formatDate(String(entry.activity_date))}
        {system && ' · Automatic'}
        {entry.source === 'staff' && (staffView ? ' · Added by staff' : ' · Added by your coordinator')}
      </p>
      <p className={system ? 'text-sm text-slate-700' : 'font-medium'}>{String(entry.summary)}</p>
      {!system && meta.length > 0 && <p className="text-sm text-slate-600">{meta.join(' · ')}</p>}
      {typeof entry.details_text === 'string' && entry.details_text && <p className="whitespace-pre-line text-sm">{entry.details_text}</p>}
      {typeof entry.attachment_url === 'string' && entry.attachment_url && (
        <a href={entry.attachment_url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-sm text-red-900 underline">
          Open the linked email or document
        </a>
      )}
      {entry.follow_up_needed === true && <p className="text-sm text-amber-800">Follow-up needed</p>}
      {!system && (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={onEdit}>
            Edit
          </SecondaryButton>
          {confirming ? (
            <>
              <Button type="button" className="min-h-9 px-3 text-sm" disabled={remove.pending} onClick={() => void remove.run(String(entry.id)).catch(() => undefined)}>
                Yes, delete
              </Button>
              <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(false)}>
                Keep it
              </SecondaryButton>
            </>
          ) : (
            <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(true)}>
              Delete
            </SecondaryButton>
          )}
        </div>
      )}
      {remove.error && <Message kind="error">{remove.error}</Message>}
    </li>
  )
}

/** A8b: the dated timeline for one college, newest first. System entries are shown but cannot be changed. */
export default function ActivityTab({ listId, coaches, onLog, onEdit }: { listId: string; coaches: Row[]; onLog: () => void; onEdit: (entry: Row) => void }) {
  const activity = useActivity(listId)
  const types = useActivityTypes()
  const [type, setType] = useState('')
  const typeLabel = (code: unknown) => types.data?.find((t) => t.code === code)?.label ?? ''
  const coachName = (e: Row) => (e.coach_id != null ? String(coaches.find((c) => c.id === e.coach_id)?.full_name ?? '') : typeof e.coach_name_text === 'string' ? e.coach_name_text : '')
  const rows = (activity.data ?? []).filter((e) => !type || e.activity_type_code === type)

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={onLog}>
        Log activity
      </Button>
      {activity.isPending ? (
        <p role="status" className="text-slate-600">
          Loading…
        </p>
      ) : activity.isError ? (
        <Message kind="error">We could not load the activity. Check your connection and reload.</Message>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="activity-type-filter" className="text-sm font-medium">
              Show
            </label>
            <select
              id="activity-type-filter"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="min-h-11 rounded border border-slate-400 bg-white px-2 text-base"
            >
              <option value="">Everything</option>
              {(types.data ?? []).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-600">{type ? 'Nothing of that kind yet.' : 'Nothing logged yet. Log every email, call, visit and camp so you can see the whole story.'}</p>
          ) : (
            <ul aria-label="Activity" className="flex flex-col gap-2">
              {rows.map((e) => (
                <Entry key={String(e.id)} entry={e} typeLabel={typeLabel(e.activity_type_code)} coachName={coachName(e)} onEdit={() => onEdit(e)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
