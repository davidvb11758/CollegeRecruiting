import { z } from 'zod'
import { ageOn, decimalField, intField, maxText, optionalDate, optionalEmail, optionalUrl, requiredUrl, todayString } from './forms'

const name = (label: string) => z.string().trim().min(1, `Enter ${label}`).max(60, 'Use 60 characters or fewer')
const optionalText = (max = 120) => z.string().trim().max(max, `Use ${max} characters or fewer`)

const dateOfBirth = z
  .string()
  .trim()
  .min(1, 'Enter the date of birth')
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)), 'Enter a valid date')

/** First login: the athlete must be 14 to 18, the same rule the database applies when the record is created. */
export const createProfileSchema = z.object({
  firstName: name('the first name'),
  lastName: name('the last name'),
  dateOfBirth: dateOfBirth.refine((v) => {
    const age = ageOn(v, todayString())
    return age >= 14 && age <= 18
  }, 'Athletes must be 14 to 18 years old'),
  graduationYear: z.string().regex(/^\d{4}$/, 'Choose the graduation year'),
  homeState: z.string().length(2, 'Choose the home state'),
  teamId: z.string().min(1, 'Choose a team'),
})

const guardianSchema = z.object({
  id: z.string(),
  relationship: z.enum(['mother', 'father', 'guardian', 'other'], 'Choose the relationship'),
  fullName: name('the name'),
  email: optionalEmail,
  phone: optionalText(30),
  okToShare: z.boolean(),
})

/** A2a. Date of birth can be corrected later; the 14-18 rule applies only when the record is created. */
export const personalSchema = z
  .object({
    firstName: name('the first name'),
    lastName: name('the last name'),
    preferredName: optionalText(60),
    dateOfBirth: dateOfBirth.refine((v) => v <= todayString(), 'The date of birth cannot be in the future'),
    graduationYear: intField('Graduation year', 2025, 2040).refine((v) => v !== '', 'Choose the graduation year'),
    homeCity: optionalText(80),
    homeState: z.string().length(2, 'Choose the home state'),
    homeZip: z.string().trim().refine((v) => v === '' || /^\d{5}$/.test(v), 'ZIP code must be 5 digits'),
    athleteEmail: optionalEmail,
    athletePhone: optionalText(30),
    preferredContact: z.enum(['', 'email', 'phone', 'text']),
    jerseyNumber: optionalText(6),
    guardians: z.array(guardianSchema).max(2, 'You can add at most 2 parents or guardians'),
    primaryGuardian: z.string(),
  })
  .refine((d) => d.guardians.length === 0 || /^[01]$/.test(d.primaryGuardian) && Number(d.primaryGuardian) < d.guardians.length, {
    path: ['primaryGuardian'],
    message: 'Choose which parent or guardian is the main contact',
  })

/** A2b */
export const athleticSchema = z
  .object({
    primaryPosition: z.string().min(1, 'Choose the main position'),
    secondaryPosition: z.string(),
    heightIn: intField('Height', 48, 96),
    standingReachIn: intField('Standing reach', 60, 130),
    approachTouchIn: intField('Approach touch', 60, 160),
    blockTouchIn: intField('Block touch', 60, 160),
    dominantHand: z.enum(['', 'right', 'left']),
    clubTeamName: optionalText(),
    clubLevel: optionalText(60),
    clubCoachName: optionalText(),
    clubCoachEmail: optionalEmail,
    clubCoachPhone: optionalText(30),
    hsCoachName: optionalText(),
    hsCoachEmail: optionalEmail,
    hsCoachPhone: optionalText(30),
    awardsText: maxText('Awards', 4000),
    statsSummaryText: maxText('Stats', 4000),
    aboutMeText: maxText('About me', 2000),
  })
  .refine((d) => d.secondaryPosition === '' || d.secondaryPosition !== d.primaryPosition, {
    path: ['secondaryPosition'],
    message: 'The second position must be different from the main position',
  })

const eligibility = z.enum(['', 'not_started', 'registered', 'unsure'])

/** A2c */
export const academicSchema = z
  .object({
    hsName: optionalText(),
    hsCity: optionalText(80),
    hsState: z.string(),
    gpaUnweighted: decimalField('GPA', 0, 4),
    gpaWeighted: decimalField('Weighted GPA', 0, 5.5),
    classRankText: optionalText(40),
    majorUndecided: z.boolean(),
    intendedMajors: z.array(z.string()).max(3, 'Choose at most 3 intended majors'),
    satTotal: intField('SAT', 400, 1600),
    satDate: optionalDate,
    actComposite: intField('ACT', 1, 36),
    actDate: optionalDate,
    plannedTestDatesText: optionalText(200),
    ncaaEcStatus: eligibility,
    naiaStatus: eligibility,
    counselorName: optionalText(),
    counselorEmail: optionalEmail,
  })
  .refine((d) => !(d.majorUndecided && d.intendedMajors.length > 0), {
    path: ['intendedMajors'],
    message: 'Untick "Undecided" or clear the chosen majors',
  })

const videoSchema = z.object({ id: z.string(), label: optionalText(80), url: requiredUrl })

const handle = z
  .string()
  .trim()
  .max(60, 'Use 60 characters or fewer')
  .refine((v) => !/\s/.test(v), 'A handle has no spaces')

/** A2d */
export const highlightsSchema = z.object({
  videos: z.array(videoSchema).max(3, 'You can add at most 3 video links'),
  instagramHandle: handle,
  xHandle: handle,
  tiktokHandle: handle,
  externalProfileUrl: optionalUrl,
  gameFilmUrl: optionalUrl,
})

export const DIVISION_INTEREST = ['none', 'open_to', 'top_choice'] as const

/** A3. Divisions are stored as one choice each; "none" means no row. */
export const preferencesSchema = z.object({
  divisions: z.record(z.string(), z.enum(DIVISION_INTEREST)),
  bands: z.array(z.string().regex(/^[1-6]$/)).min(1, 'Choose at least one level'),
  playingTime: z.enum(['', 'start_freshman', 'earn_spot', 'develop']),
  regions: z.array(z.enum(['Northeast', 'Midwest', 'South', 'West'])),
  schoolSizes: z.array(z.enum(['small', 'medium', 'large'])),
  controlTypes: z.array(z.enum(['public', 'private'])),
  campusSettings: z.array(z.enum(['urban', 'suburban', 'rural'])),
  academicImportance: z.enum(['', '1', '2', '3', '4', '5']),
  costNeed: z.enum(['', 'significant_aid', 'some_aid', 'not_a_factor']),
  interestMajors: z.array(z.string()),
  mustHavesText: maxText('Must-haves', 2000),
  dealBreakersText: maxText('Deal-breakers', 2000),
  idealSchoolText: maxText('Ideal school', 2000),
})

export type CreateProfileValues = z.infer<typeof createProfileSchema>
export type PersonalValues = z.infer<typeof personalSchema>
export type AthleticValues = z.infer<typeof athleticSchema>
export type AcademicValues = z.infer<typeof academicSchema>
export type HighlightsValues = z.infer<typeof highlightsSchema>
export type PreferencesValues = z.infer<typeof preferencesSchema>
