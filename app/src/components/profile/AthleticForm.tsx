import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { str } from '../../lib/forms'
import { saveAthletic, type Lookups, type ProfileBundle } from '../../lib/profileApi'
import { useSectionSave } from '../../lib/profileHooks'
import { athleticSchema, type AthleticValues } from '../../lib/profileSchemas'
import { Field, SectionForm, SelectField, TextAreaField } from '../ui'

function defaults(profile: ProfileBundle): AthleticValues {
  const a = profile.athletic ?? {}
  return {
    primaryPosition: str(a.primary_position),
    secondaryPosition: str(a.secondary_position),
    heightIn: str(a.height_in),
    standingReachIn: str(a.standing_reach_in),
    approachTouchIn: str(a.approach_touch_in),
    blockTouchIn: str(a.block_touch_in),
    dominantHand: str(a.dominant_hand) as AthleticValues['dominantHand'],
    clubTeamName: str(a.club_team_name),
    clubLevel: str(a.club_level),
    clubCoachName: str(a.club_coach_name),
    clubCoachEmail: str(a.club_coach_email),
    clubCoachPhone: str(a.club_coach_phone),
    hsCoachName: str(a.hs_coach_name),
    hsCoachEmail: str(a.hs_coach_email),
    hsCoachPhone: str(a.hs_coach_phone),
    awardsText: str(a.awards_text),
    statsSummaryText: str(a.stats_summary_text),
    aboutMeText: str(a.about_me_text),
  }
}

const HANDS = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
]

/** A2b: position, measurables, coaches, awards and stats. */
export default function AthleticForm({ athleteId, profile, lookups }: { athleteId: string; profile: ProfileBundle; lookups: Lookups }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AthleticValues>({ resolver: zodResolver(athleticSchema), values: defaults(profile) })
  const section = useSectionSave(athleteId, (v: AthleticValues) => saveAthletic(athleteId, v))
  const positions = lookups.positions.map((p) => ({ value: p.code, label: p.label }))

  return (
    <SectionForm
      onSubmit={handleSubmit((v) => section.save(v).catch(() => undefined))}
      saving={section.saving}
      saved={section.saved}
      error={section.error}
    >
      <SelectField label="Main position" options={positions} placeholder="Choose" error={errors.primaryPosition?.message} {...register('primaryPosition')} />
      <SelectField label="Second position" options={positions} placeholder="None" error={errors.secondaryPosition?.message} {...register('secondaryPosition')} />
      <Field label="Height (inches)" inputMode="numeric" hint={'In inches. For example 5\'10" is 70.'} error={errors.heightIn?.message} {...register('heightIn')} />
      <Field label="Standing reach (inches)" inputMode="numeric" error={errors.standingReachIn?.message} {...register('standingReachIn')} />
      <Field label="Approach touch (inches)" inputMode="numeric" error={errors.approachTouchIn?.message} {...register('approachTouchIn')} />
      <Field label="Block touch (inches)" inputMode="numeric" error={errors.blockTouchIn?.message} {...register('blockTouchIn')} />
      <SelectField label="Dominant hand" options={HANDS} placeholder="Choose" error={errors.dominantHand?.message} {...register('dominantHand')} />

      <h2 className="text-lg font-semibold">Club team</h2>
      <Field label="Club team name" error={errors.clubTeamName?.message} {...register('clubTeamName')} />
      <Field label="Club level" hint="For example 16 Open or 16 Club." error={errors.clubLevel?.message} {...register('clubLevel')} />
      <Field label="Club coach name" error={errors.clubCoachName?.message} {...register('clubCoachName')} />
      <Field label="Club coach email" type="email" error={errors.clubCoachEmail?.message} {...register('clubCoachEmail')} />
      <Field label="Club coach phone" type="tel" error={errors.clubCoachPhone?.message} {...register('clubCoachPhone')} />

      <h2 className="text-lg font-semibold">High school coach</h2>
      <Field label="High school coach name" error={errors.hsCoachName?.message} {...register('hsCoachName')} />
      <Field label="High school coach email" type="email" error={errors.hsCoachEmail?.message} {...register('hsCoachEmail')} />
      <Field label="High school coach phone" type="tel" error={errors.hsCoachPhone?.message} {...register('hsCoachPhone')} />

      <TextAreaField label="Awards and honors" error={errors.awardsText?.message} {...register('awardsText')} />
      <TextAreaField label="Stats summary" error={errors.statsSummaryText?.message} {...register('statsSummaryText')} />
      <TextAreaField label="About me" hint="A few sentences coaches should know." error={errors.aboutMeText?.message} {...register('aboutMeText')} />
    </SectionForm>
  )
}
