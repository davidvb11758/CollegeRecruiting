import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { str } from '../../lib/forms'
import { savePreferences, type Lookups, type ProfileBundle } from '../../lib/profileApi'
import { useSectionSave } from '../../lib/profileHooks'
import { preferencesSchema, type PreferencesValues } from '../../lib/profileSchemas'
import { CheckboxGroup, SectionForm, SelectField, TextAreaField } from '../ui'

const BAND_OPTIONS = [
  { value: '1', label: 'Level 1: top 10% of programs' },
  { value: '2', label: 'Level 2: next 10%' },
  { value: '3', label: 'Level 3: next 10%' },
  { value: '4', label: 'Level 4: next 10%' },
  { value: '5', label: 'Level 5: next 10%' },
  { value: '6', label: 'Level 6: lower half' },
]
const REGIONS = ['Northeast', 'Midwest', 'South', 'West'].map((r) => ({ value: r, label: r }))
const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]
const CONTROL = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]
const SETTINGS = [
  { value: 'urban', label: 'City' },
  { value: 'suburban', label: 'Suburb' },
  { value: 'rural', label: 'Rural' },
]
const PLAYING_TIME = [
  { value: 'start_freshman', label: 'Start as a freshman' },
  { value: 'earn_spot', label: 'Earn a spot' },
  { value: 'develop', label: 'Develop first' },
]
const COST = [
  { value: 'significant_aid', label: 'I need significant aid' },
  { value: 'some_aid', label: 'Some aid would help' },
  { value: 'not_a_factor', label: 'Cost is not a factor' },
]
const IMPORTANCE = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: n === 1 ? '1 (not very important)' : n === 5 ? '5 (very important)' : String(n),
}))
const INTEREST = [
  { value: 'none', label: 'Not interested' },
  { value: 'open_to', label: 'Open to' },
  { value: 'top_choice', label: 'Top choice' },
]

function defaults(profile: ProfileBundle, lookups: Lookups): PreferencesValues {
  const p = profile.preference ?? {}
  const divisions = Object.fromEntries(
    lookups.divisions.map((d) => {
      const row = profile.divisions.find((x) => x.division_code === d.code)
      return [d.code, (row ? str(row.interest) : 'none') as 'none' | 'open_to' | 'top_choice']
    }),
  )
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  return {
    divisions,
    bands: list(p.competitiveness_bands),
    playingTime: str(p.playing_time_expectation) as PreferencesValues['playingTime'],
    regions: list(p.preferred_regions) as PreferencesValues['regions'],
    schoolSizes: list(p.school_sizes) as PreferencesValues['schoolSizes'],
    controlTypes: list(p.control_types) as PreferencesValues['controlTypes'],
    campusSettings: list(p.campus_settings) as PreferencesValues['campusSettings'],
    academicImportance: str(p.academic_importance) as PreferencesValues['academicImportance'],
    costNeed: str(p.cost_need) as PreferencesValues['costNeed'],
    interestMajors: profile.majors.filter((m) => m.kind === 'interest').map((m) => str(m.major_code)),
    mustHavesText: str(p.must_haves_text),
    dealBreakersText: str(p.deal_breakers_text),
    idealSchoolText: str(p.ideal_school_text),
  }
}

/** A3: what the athlete is looking for. Saving fills in "My College Preferences" and the profile percentage. */
export default function PreferencesForm({ athleteId, profile, lookups }: { athleteId: string; profile: ProfileBundle; lookups: Lookups }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PreferencesValues>({ resolver: zodResolver(preferencesSchema), values: defaults(profile, lookups) })
  const section = useSectionSave(athleteId, (v: PreferencesValues) => savePreferences(athleteId, v, profile))

  return (
    <SectionForm
      onSubmit={handleSubmit((v) => section.save(v).catch(() => undefined))}
      saving={section.saving}
      saved={section.saved}
      error={section.error}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Divisions</legend>
        <p className="text-sm text-muted">For each division, say how interested you are.</p>
        {lookups.divisions.map((d) => (
          <div key={d.code} className="flex flex-col gap-1 rounded border border-line bg-surface p-3">
            <span className="text-sm font-medium">{d.label}</span>
            <div className="flex flex-wrap gap-x-4">
              {INTEREST.map((o) => (
                <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" value={o.value} className="size-5" aria-label={`${d.label}: ${o.label}`} {...register(`divisions.${d.code}`)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <CheckboxGroup
        legend="Program levels I would consider"
        hint="Programs are ranked inside their division. Tick every level you would consider."
        options={BAND_OPTIONS}
        error={errors.bands?.message}
        {...register('bands')}
      />
      <SelectField label="Playing time I hope for" options={PLAYING_TIME} placeholder="No preference" error={errors.playingTime?.message} {...register('playingTime')} />
      <CheckboxGroup legend="Regions" options={REGIONS} {...register('regions')} />
      <CheckboxGroup legend="School size" options={SIZES} {...register('schoolSizes')} />
      <CheckboxGroup legend="Public or private" options={CONTROL} {...register('controlTypes')} />
      <CheckboxGroup legend="Campus setting" options={SETTINGS} {...register('campusSettings')} />
      <SelectField label="How important are academics?" options={IMPORTANCE} placeholder="Choose" {...register('academicImportance')} />
      <SelectField label="Cost" options={COST} placeholder="Choose" {...register('costNeed')} />
      <CheckboxGroup
        legend="Other majors I would consider"
        hint="Your intended majors are on the Academics tab."
        options={lookups.majors.map((m) => ({ value: m.code, label: m.label }))}
        {...register('interestMajors')}
      />
      <TextAreaField label="Must-haves" error={errors.mustHavesText?.message} {...register('mustHavesText')} />
      <TextAreaField label="Deal-breakers" error={errors.dealBreakersText?.message} {...register('dealBreakersText')} />
      <TextAreaField label="My ideal school" error={errors.idealSchoolText?.message} {...register('idealSchoolText')} />
    </SectionForm>
  )
}
