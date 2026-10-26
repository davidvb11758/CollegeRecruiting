import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { graduationYears, str } from '../../lib/forms'
import { savePersonal, type Lookups, type ProfileBundle } from '../../lib/profileApi'
import { useSectionSave } from '../../lib/profileHooks'
import { personalSchema, type PersonalValues } from '../../lib/profileSchemas'
import { OutlineButton, CheckboxField, Field, SecondaryButton, SectionForm, SelectField } from '../ui'

const RELATIONSHIPS = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
]
const CONTACT = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone call' },
  { value: 'text', label: 'Text message' },
]

function defaults(profile: ProfileBundle): PersonalValues {
  const a = profile.athlete
  const guardians = profile.guardians.map((g) => ({
    id: String(g.id),
    relationship: str(g.relationship) as PersonalValues['guardians'][number]['relationship'],
    fullName: str(g.full_name),
    email: str(g.email),
    phone: str(g.phone),
    okToShare: g.ok_to_share !== false,
  }))
  const primary = profile.guardians.findIndex((g) => g.is_primary)
  return {
    firstName: str(a.first_name),
    lastName: str(a.last_name),
    preferredName: str(a.preferred_name),
    dateOfBirth: str(a.date_of_birth),
    graduationYear: str(a.graduation_year),
    homeCity: str(a.home_city),
    homeState: str(a.home_state),
    homeZip: str(a.home_zip),
    athleteEmail: str(a.athlete_email),
    athletePhone: str(a.athlete_phone),
    preferredContact: str(a.preferred_contact) as PersonalValues['preferredContact'],
    jerseyNumber: str(a.jersey_number),
    guardians,
    primaryGuardian: guardians.length ? String(Math.max(primary, 0)) : '',
  }
}

/** A2a: identity, contact, and up to 2 parents or guardians (exactly one is the main contact). */
export default function PersonalForm({ athleteId, profile, lookups }: { athleteId: string; profile: ProfileBundle; lookups: Lookups }) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<PersonalValues>({ resolver: zodResolver(personalSchema), values: defaults(profile) })
  const { fields, append, remove } = useFieldArray({ control, name: 'guardians' })
  const section = useSectionSave(athleteId, (v: PersonalValues) => savePersonal(athleteId, v, profile.guardians))
  const states = lookups.states.map((s) => ({ value: s.code, label: s.name }))

  const removeGuardian = (index: number) => {
    const primary = Number(getValues('primaryGuardian'))
    remove(index)
    const left = getValues('guardians').length
    if (left === 0) setValue('primaryGuardian', '')
    else if (index === primary) setValue('primaryGuardian', '0')
    else if (index < primary) setValue('primaryGuardian', String(primary - 1))
  }

  return (
    <SectionForm
      onSubmit={handleSubmit((v) => section.save(v).catch(() => undefined))}
      saving={section.saving}
      saved={section.saved}
      error={section.error}
    >
      <Field label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
      <Field label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
      <Field label="Preferred name" hint="Optional. What coaches should call you." error={errors.preferredName?.message} {...register('preferredName')} />
      <Field label="Date of birth" type="date" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
      <SelectField label="Graduation year" options={graduationYears(undefined, str(profile.athlete.graduation_year))} placeholder="Choose" error={errors.graduationYear?.message} {...register('graduationYear')} />
      <Field label="Home city" error={errors.homeCity?.message} {...register('homeCity')} />
      <SelectField label="Home state" options={states} placeholder="Choose" error={errors.homeState?.message} {...register('homeState')} />
      <Field label="Home ZIP code" inputMode="numeric" maxLength={5} error={errors.homeZip?.message} {...register('homeZip')} />
      <Field label="Athlete email" type="email" hint="Optional. Coaches may use this to reach you." error={errors.athleteEmail?.message} {...register('athleteEmail')} />
      <Field label="Athlete phone" type="tel" error={errors.athletePhone?.message} {...register('athletePhone')} />
      <SelectField label="Best way for coaches to reach you" options={CONTACT} placeholder="No preference" error={errors.preferredContact?.message} {...register('preferredContact')} />
      <Field label="Jersey number" error={errors.jerseyNumber?.message} {...register('jerseyNumber')} />

      <h2 className="text-lg font-semibold">Parents and guardians</h2>
      <p className="text-sm text-slate-600">Add up to 2. Choose one as the main contact.</p>
      {fields.map((field, index) => (
        <fieldset key={field.id} className="flex flex-col gap-3 rounded border border-slate-300 bg-white p-3">
          <legend className="px-1 text-sm font-medium">Parent or guardian {index + 1}</legend>
          <input type="hidden" {...register(`guardians.${index}.id`)} />
          <SelectField label="Relationship" options={RELATIONSHIPS} placeholder="Choose" error={errors.guardians?.[index]?.relationship?.message} {...register(`guardians.${index}.relationship`)} />
          <Field label="Full name" error={errors.guardians?.[index]?.fullName?.message} {...register(`guardians.${index}.fullName`)} />
          <Field label="Email" type="email" error={errors.guardians?.[index]?.email?.message} {...register(`guardians.${index}.email`)} />
          <Field label="Phone" type="tel" error={errors.guardians?.[index]?.phone?.message} {...register(`guardians.${index}.phone`)} />
          <CheckboxField label="OK to share this contact with college coaches" {...register(`guardians.${index}.okToShare`)} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" value={String(index)} className="size-5" {...register('primaryGuardian')} />
            Main contact
          </label>
          <SecondaryButton type="button" onClick={() => removeGuardian(index)}>
            Remove
          </SecondaryButton>
        </fieldset>
      ))}
      {errors.primaryGuardian && <p className="text-sm text-red-700">{errors.primaryGuardian.message}</p>}
      {errors.guardians?.root && <p className="text-sm text-red-700">{errors.guardians.root.message}</p>}
      {fields.length < 2 && (
        <OutlineButton
          type="button"
          onClick={() => {
            append({ id: '', relationship: 'mother', fullName: '', email: '', phone: '', okToShare: true })
            if (fields.length === 0) setValue('primaryGuardian', '0')
          }}
        >
          Add a parent or guardian
        </OutlineButton>
      )}
    </SectionForm>
  )
}
