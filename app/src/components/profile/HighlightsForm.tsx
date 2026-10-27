import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { str } from '../../lib/forms'
import { saveHighlights, type ProfileBundle } from '../../lib/profileApi'
import { useSectionSave } from '../../lib/profileHooks'
import { highlightsSchema, type HighlightsValues } from '../../lib/profileSchemas'
import { Field, Message, OutlineButton, SecondaryButton, SectionForm } from '../ui'

function defaults(profile: ProfileBundle): HighlightsValues {
  const a = profile.athletic ?? {}
  return {
    videos: profile.videos.map((v) => ({ id: String(v.id), label: str(v.label), url: str(v.url) })),
    instagramHandle: str(a.instagram_handle),
    tiktokHandle: str(a.tiktok_handle),
  }
}

/** A2d: up to 3 video links, social handles and profile links. */
export default function HighlightsForm({ athleteId, profile }: { athleteId: string; profile: ProfileBundle }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<HighlightsValues>({ resolver: zodResolver(highlightsSchema), values: defaults(profile) })
  const { fields, append, remove } = useFieldArray({ control, name: 'videos' })
  const section = useSectionSave(athleteId, (v: HighlightsValues) => saveHighlights(athleteId, v, profile))

  return (
    <SectionForm
      onSubmit={handleSubmit((v) => section.save(v).catch(() => undefined))}
      saving={section.saving}
      saved={section.saved}
      error={section.error}
    >
      <h2 className="text-lg font-semibold">Highlight videos</h2>
      <p className="text-sm text-muted">Add up to 3 links, for example YouTube or Hudl.</p>
      {fields.map((field, index) => (
        <fieldset key={field.id} className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
          <legend className="px-1 text-sm font-medium">Video {index + 1}</legend>
          <input type="hidden" {...register(`videos.${index}.id`)} />
          <Field label="Title" error={errors.videos?.[index]?.label?.message} {...register(`videos.${index}.label`)} />
          <Field label="Link" type="url" inputMode="url" error={errors.videos?.[index]?.url?.message} {...register(`videos.${index}.url`)} />
          <SecondaryButton type="button" onClick={() => remove(index)}>
            Remove
          </SecondaryButton>
        </fieldset>
      ))}
      {errors.videos?.root && <p className="text-sm text-danger">{errors.videos.root.message}</p>}
      {fields.length < 3 && (
        <OutlineButton type="button" onClick={() => append({ id: '', label: '', url: '' })}>
          Add a video link
        </OutlineButton>
      )}

      <h2 className="text-lg font-semibold">Social and profile links</h2>
      {profile.athletic ? (
        <>
          <Field label="Instagram" hint="Your handle, for example rocketsvb16." error={errors.instagramHandle?.message} {...register('instagramHandle')} />
          <Field label="TikTok" error={errors.tiktokHandle?.message} {...register('tiktokHandle')} />
        </>
      ) : (
        <Message kind="info">Fill in and save the Athletic tab first (main position). Then you can add social and profile links here.</Message>
      )}
    </SectionForm>
  )
}
