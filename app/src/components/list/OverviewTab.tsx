import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { formatDate } from '../../lib/dates'
import { str } from '../../lib/forms'
import { archiveEntry, saveOverview, type ListHub } from '../../lib/listApi'
import { useListWrite } from '../../lib/listHooks'
import { CLOSED_REASON_OPTIONS, PRIORITY_OPTIONS, STAGE_OPTIONS } from '../../lib/listLabels'
import { overviewSchema, type OverviewValues } from '../../lib/listSchemas'
import { Button, CheckboxField, Message, SecondaryButton, SectionForm, SelectField, TextAreaField } from '../ui'

function defaults(entry: ListHub['entry']): OverviewValues {
  return {
    priority: str(entry.priority) as OverviewValues['priority'],
    stage: str(entry.stage) as OverviewValues['stage'],
    closedReason: str(entry.closed_reason) as OverviewValues['closedReason'],
    mainCoachId: str(entry.main_coach_id),
    whyILikeText: str(entry.why_i_like_text),
    notesText: str(entry.notes_text),
    questionnaireDone: entry.questionnaire_completed_on != null,
  }
}

/** A8a: why I like it, notes, priority, stage, main coach, questionnaire tick, and removing the college from the list. */
export default function OverviewTab({ listId, hub }: { listId: string; hub: ListHub }) {
  const navigate = useNavigate()
  const write = useListWrite((v: OverviewValues) => saveOverview(listId, v, hub.entry))
  const archive = useListWrite(() => archiveEntry(listId))
  const [confirming, setConfirming] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OverviewValues>({ resolver: zodResolver(overviewSchema), values: defaults(hub.entry) })
  const stage = useWatch({ control, name: 'stage' })
  const questionnaireOn = hub.entry.questionnaire_completed_on

  return (
    <div className="flex flex-col gap-6">
      <SectionForm onSubmit={handleSubmit((v) => write.run(v).catch(() => undefined))} saving={write.pending} saved={write.saved} error={write.error}>
        <SelectField label="Priority" options={PRIORITY_OPTIONS} error={errors.priority?.message} {...register('priority')} />
        <SelectField label="Stage" options={STAGE_OPTIONS} error={errors.stage?.message} {...register('stage')} />
        {stage === 'closed' && (
          <SelectField label="Why is it closed?" placeholder="Choose" options={CLOSED_REASON_OPTIONS} error={errors.closedReason?.message} {...register('closedReason')} />
        )}
        <SelectField
          label="Coach I am mainly talking to"
          placeholder="No one yet"
          options={hub.coaches.map((c) => ({ value: String(c.id), label: String(c.full_name) }))}
          {...register('mainCoachId')}
        />
        <CheckboxField
          label={typeof questionnaireOn === 'string' ? `I completed their recruiting questionnaire (${formatDate(questionnaireOn)})` : 'I completed their recruiting questionnaire'}
          {...register('questionnaireDone')}
        />
        <TextAreaField label="Why I like this school" error={errors.whyILikeText?.message} {...register('whyILikeText')} />
        <TextAreaField label="Notes" error={errors.notesText?.message} {...register('notesText')} />
      </SectionForm>

      <section className="flex flex-col gap-2 border-t border-slate-300 pt-4" aria-label="Remove from My List">
        <h2 className="text-lg font-semibold">Remove from My List</h2>
        <p className="text-sm text-slate-600">The college and its history are kept. You can bring it back from My List.</p>
        {archive.error && <Message kind="error">{archive.error}</Message>}
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={archive.pending} onClick={() => void archive.run(undefined).then(() => navigate('/list'), () => undefined)}>
              Yes, remove it
            </Button>
            <SecondaryButton type="button" onClick={() => setConfirming(false)}>
              Keep it
            </SecondaryButton>
          </div>
        ) : (
          <SecondaryButton type="button" onClick={() => setConfirming(true)}>
            Remove from My List
          </SecondaryButton>
        )}
      </section>
    </div>
  )
}
