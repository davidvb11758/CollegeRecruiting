import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { clubToday } from '../../lib/dates'
import { str } from '../../lib/forms'
import { saveActivity, type Row } from '../../lib/listApi'
import { useActivityTypes, useListWrite } from '../../lib/listHooks'
import { DIRECTION_OPTIONS, OUTCOME_OPTIONS } from '../../lib/listLabels'
import { activitySchema, type ActivityValues } from '../../lib/listSchemas'
import { Button, CheckList, CheckboxField, Field, Message, SecondaryButton, SelectField, TextAreaField } from '../ui'

/** A9: log (or correct) one contact, visit or other event for a college. */
export default function ActivityForm({
  athleteId,
  listId,
  coaches,
  entry,
  prefill,
  onSaved,
  onCancel,
}: {
  athleteId: string
  listId: string
  coaches: Row[]
  entry?: Row
  prefill?: Partial<ActivityValues>
  onSaved: (result: { followUp: boolean }) => void
  onCancel: () => void
}) {
  const types = useActivityTypes()
  const write = useListWrite((v: ActivityValues) => saveActivity({ athleteId, listId, id: entry ? String(entry.id) : undefined }, v))
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ActivityValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      activityDate: str(entry?.activity_date) || clubToday(),
      activityTypeCode: str(entry?.activity_type_code),
      direction: str(entry?.direction) as ActivityValues['direction'],
      coachIds: Array.isArray(entry?.coach_ids) ? entry.coach_ids.map(String) : [],
      coachNameText: str(entry?.coach_name_text),
      summary: str(entry?.summary),
      detailsText: str(entry?.details_text),
      outcome: str(entry?.outcome) as ActivityValues['outcome'],
      followUpNeeded: entry?.follow_up_needed === true,
      ...prefill,
    },
  })
  const typeCode = useWatch({ control, name: 'activityTypeCode' })
  const coachIds = useWatch({ control, name: 'coachIds' })
  const needsDirection = types.data?.find((t) => t.code === typeCode)?.requires_direction === true

  // The pick-list must exist before the form does, or a pre-filled type would not show.
  if (types.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading…
      </p>
    )
  }

  const submit = handleSubmit((v) => {
    if (needsDirection && v.direction === '') {
      setError('direction', { message: 'Choose who made contact' })
      return
    }
    return write.run(v).then(() => onSaved({ followUp: v.followUpNeeded && !entry }), () => undefined)
  })

  return (
    <form noValidate aria-label={entry ? 'Edit activity' : 'Log activity'} onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{entry ? 'Change this entry' : 'Log activity'}</h2>
      <SelectField
        label="What happened"
        placeholder="Choose"
        options={(types.data ?? []).filter((t) => t.user_selectable || t.code === typeCode).map((t) => ({ value: t.code, label: t.label }))}
        error={errors.activityTypeCode?.message}
        {...register('activityTypeCode')}
      />
      {needsDirection && <SelectField label="Who made contact" placeholder="Choose" options={DIRECTION_OPTIONS} error={errors.direction?.message} {...register('direction')} />}
      <Field label="Date" type="date" error={errors.activityDate?.message} {...register('activityDate')} />
      {coaches.length > 0 && (
        <>
          <CheckList
            legend="Which coaches (choose all that apply)"
            options={coaches.map((c) => ({ value: String(c.id), label: String(c.full_name) }))}
            value={coachIds}
            onChange={(next) => setValue('coachIds', next, { shouldDirty: true })}
          />
          {errors.coachIds?.message && <p className="text-sm text-danger">{errors.coachIds.message}</p>}
        </>
      )}
      {coachIds.length === 0 && (
        <Field
          label={coaches.length > 0 ? 'Coach name (if not listed)' : 'Coach name'}
          hint="Optional."
          error={errors.coachNameText?.message}
          {...register('coachNameText')}
        />
      )}
      <Field label="Summary" hint="One line, for example: Sent intro email with video." error={errors.summary?.message} {...register('summary')} />
      <TextAreaField label="Details" hint="What was said, what the coach asked for." error={errors.detailsText?.message} {...register('detailsText')} />
      <SelectField label="How it went" placeholder="Not sure yet" options={OUTCOME_OPTIONS} error={errors.outcome?.message} {...register('outcome')} />
      <CheckboxField label="I need to follow up" {...register('followUpNeeded')} />
      {write.error && <Message kind="error">{write.error}</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Saving…' : 'Save'}
      </Button>
      <SecondaryButton type="button" onClick={onCancel}>
        Cancel
      </SecondaryButton>
    </form>
  )
}
