import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { addDays, clubToday } from '../../lib/dates'
import { str } from '../../lib/forms'
import { defaultDueDate, saveNextStep, type Row } from '../../lib/listApi'
import { useListWrite, useStepTypes } from '../../lib/listHooks'
import { nextStepSchema, type NextStepValues } from '../../lib/listSchemas'
import { Button, Field, Message, SecondaryButton, SelectField } from '../ui'

/** A10: set or change the one open next step for a college. The type pre-fills a suggested sentence. */
export default function NextStepForm({
  athleteId,
  listId,
  step,
  prefill,
  onSaved,
  onCancel,
}: {
  athleteId: string
  listId: string
  step?: Row
  prefill?: Partial<NextStepValues>
  onSaved: () => void
  onCancel: () => void
}) {
  const types = useStepTypes()
  const write = useListWrite((v: NextStepValues) => saveNextStep({ athleteId, listId, id: step ? String(step.id) : undefined }, v))
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<NextStepValues>({
    resolver: zodResolver(nextStepSchema),
    defaultValues: {
      stepTypeCode: str(step?.step_type_code),
      description: str(step?.description),
      dueDate: str(step?.due_date) || defaultDueDate(),
      ...prefill,
    },
  })
  const typeField = register('stepTypeCode', {
    onChange: (e) => {
      const suggestion = types.data?.find((t) => t.code === e.target.value)?.suggested_text
      if (suggestion && !getValues('description').trim()) setValue('description', suggestion, { shouldValidate: true })
    },
  })

  // The pick-list must exist before the form does, or a saved type would not show.
  if (types.isPending) {
    return (
      <p role="status" className="text-muted">
        Loading…
      </p>
    )
  }

  return (
    <form
      noValidate
      aria-label={step ? 'Edit next step' : 'Set next step'}
      onSubmit={handleSubmit((v) => write.run(v).then(onSaved, () => undefined))}
      className="flex flex-col gap-4"
    >
      <h2 className="text-lg font-semibold">{step ? 'Change the next step' : 'Set the next step'}</h2>
      <SelectField
        label="Type"
        placeholder="Choose (optional)"
        options={(types.data ?? []).map((t) => ({ value: t.code, label: t.label }))}
        error={errors.stepTypeCode?.message}
        {...typeField}
      />
      <Field label="What to do" error={errors.description?.message} {...register('description')} />
      <Field label="Due date" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick due dates">
        {[
          { label: 'Tomorrow', days: 1 },
          { label: 'In 1 week', days: 7 },
          { label: 'In 2 weeks', days: 14 },
        ].map((q) => (
          <SecondaryButton key={q.days} type="button" className="min-h-9 px-3 text-sm" onClick={() => setValue('dueDate', addDays(clubToday(), q.days), { shouldValidate: true })}>
            {q.label}
          </SecondaryButton>
        ))}
      </div>
      {write.error && <Message kind="error">{write.error}</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Saving…' : 'Save next step'}
      </Button>
      <SecondaryButton type="button" onClick={onCancel}>
        Cancel
      </SecondaryButton>
    </form>
  )
}
