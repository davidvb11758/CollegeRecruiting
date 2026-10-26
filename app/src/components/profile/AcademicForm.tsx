import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { str } from '../../lib/forms'
import { saveAcademic, type Lookups, type ProfileBundle } from '../../lib/profileApi'
import { useSectionSave } from '../../lib/profileHooks'
import { academicSchema, type AcademicValues } from '../../lib/profileSchemas'
import { CheckboxField, CheckboxGroup, Field, SectionForm, SelectField } from '../ui'

const ELIGIBILITY = [
  { value: 'not_started', label: 'Not started' },
  { value: 'registered', label: 'Registered' },
  { value: 'unsure', label: 'Not sure' },
]

function defaults(profile: ProfileBundle): AcademicValues {
  const a = profile.academic ?? {}
  return {
    hsName: str(a.hs_name),
    hsCity: str(a.hs_city),
    hsState: str(a.hs_state),
    gpaUnweighted: str(a.gpa_unweighted),
    gpaWeighted: str(a.gpa_weighted),
    classRankText: str(a.class_rank_text),
    majorUndecided: a.major_undecided === true,
    intendedMajors: profile.majors.filter((m) => m.kind === 'intended').map((m) => str(m.major_code)),
    satTotal: str(a.sat_total),
    satDate: str(a.sat_date),
    actComposite: str(a.act_composite),
    actDate: str(a.act_date),
    plannedTestDatesText: str(a.planned_test_dates_text),
    ncaaEcStatus: str(a.ncaa_ec_status) as AcademicValues['ncaaEcStatus'],
    naiaStatus: str(a.naia_status) as AcademicValues['naiaStatus'],
    counselorName: str(a.counselor_name),
    counselorEmail: str(a.counselor_email),
  }
}

/** A2c: school, GPA, tests, eligibility, counselor, and intended majors (up to 3). */
export default function AcademicForm({ athleteId, profile, lookups }: { athleteId: string; profile: ProfileBundle; lookups: Lookups }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcademicValues>({ resolver: zodResolver(academicSchema), values: defaults(profile) })
  const section = useSectionSave(athleteId, (v: AcademicValues) => saveAcademic(athleteId, v, profile))
  const states = lookups.states.map((s) => ({ value: s.code, label: s.name }))

  return (
    <SectionForm
      onSubmit={handleSubmit((v) => section.save(v).catch(() => undefined))}
      saving={section.saving}
      saved={section.saved}
      error={section.error}
    >
      <Field label="High school" error={errors.hsName?.message} {...register('hsName')} />
      <Field label="High school city" error={errors.hsCity?.message} {...register('hsCity')} />
      <SelectField label="High school state" options={states} placeholder="Choose" error={errors.hsState?.message} {...register('hsState')} />
      <Field label="GPA (unweighted)" inputMode="decimal" hint="On a 4.0 scale, for example 3.75." error={errors.gpaUnweighted?.message} {...register('gpaUnweighted')} />
      <Field label="GPA (weighted)" inputMode="decimal" error={errors.gpaWeighted?.message} {...register('gpaWeighted')} />
      <Field label="Class rank" hint="For example 12 of 240." error={errors.classRankText?.message} {...register('classRankText')} />

      <h2 className="text-lg font-semibold">Intended majors</h2>
      <CheckboxField label="Undecided" {...register('majorUndecided')} />
      <CheckboxGroup
        legend="Choose up to 3"
        options={lookups.majors.map((m) => ({ value: m.code, label: m.label }))}
        error={errors.intendedMajors?.message}
        {...register('intendedMajors')}
      />

      <h2 className="text-lg font-semibold">Tests and eligibility</h2>
      <Field label="SAT total" inputMode="numeric" error={errors.satTotal?.message} {...register('satTotal')} />
      <Field label="SAT date" type="date" error={errors.satDate?.message} {...register('satDate')} />
      <Field label="ACT composite" inputMode="numeric" error={errors.actComposite?.message} {...register('actComposite')} />
      <Field label="ACT date" type="date" error={errors.actDate?.message} {...register('actDate')} />
      <Field label="Planned test dates" error={errors.plannedTestDatesText?.message} {...register('plannedTestDatesText')} />
      <SelectField label="NCAA Eligibility Center" options={ELIGIBILITY} placeholder="Choose" error={errors.ncaaEcStatus?.message} {...register('ncaaEcStatus')} />
      <SelectField label="NAIA eligibility" options={ELIGIBILITY} placeholder="Choose" error={errors.naiaStatus?.message} {...register('naiaStatus')} />
      <Field label="School counselor name" error={errors.counselorName?.message} {...register('counselorName')} />
      <Field label="School counselor email" type="email" error={errors.counselorEmail?.message} {...register('counselorEmail')} />
    </SectionForm>
  )
}
