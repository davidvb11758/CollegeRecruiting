import { ageOn, graduationYears, todayString } from './forms'
import {
  academicSchema,
  athleticSchema,
  createProfileSchema,
  highlightsSchema,
  personalSchema,
  preferencesSchema,
} from './profileSchemas'

const yearsAgo = (n: number, extraDays = 0) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  d.setDate(d.getDate() + extraDays)
  return todayString(d)
}

describe('age rule', () => {
  it('counts whole years like the database', () => {
    expect(ageOn('2010-05-01', '2026-04-30')).toBe(15)
    expect(ageOn('2010-05-01', '2026-05-01')).toBe(16)
  })

  const base = { firstName: 'Pat', lastName: 'Player', graduationYear: '2029', homeState: 'IA', teamId: 't1' }
  it.each([
    [13, false],
    [14, true],
    [18, true],
    [19, false],
  ])('age %i at sign-up is allowed: %s', (age, allowed) => {
    // a day after the birthday, so the athlete has just turned this age
    expect(createProfileSchema.safeParse({ ...base, dateOfBirth: yearsAgo(age, -1) }).success).toBe(allowed)
  })

  it('does not apply to later edits', () => {
    const old = personalSchema.safeParse({ ...personalBase, dateOfBirth: yearsAgo(19, -1) })
    expect(old.success).toBe(true)
  })

  it('refuses a birth date in the future', () => {
    expect(personalSchema.safeParse({ ...personalBase, dateOfBirth: yearsAgo(-1) }).success).toBe(false)
  })
})

const personalBase = {
  firstName: 'Pat',
  lastName: 'Player',
  preferredName: '',
  dateOfBirth: yearsAgo(16),
  graduationYear: '2029',
  homeCity: '',
  homeState: 'IA',
  homeZip: '',
  athleteEmail: '',
  athletePhone: '',
  preferredContact: '' as const,
  jerseyNumber: '',
  guardians: [],
  primaryGuardian: '',
}
const guardian = { id: '', relationship: 'mother' as const, fullName: 'Mom', email: '', phone: '', okToShare: true }

describe('personal tab rules', () => {
  it('accepts a minimal profile', () => {
    expect(personalSchema.safeParse(personalBase).success).toBe(true)
  })
  it.each([
    ['a short ZIP', { homeZip: '5010' }],
    ['a bad athlete email', { athleteEmail: 'nope' }],
    ['a guardian with no main contact', { guardians: [guardian], primaryGuardian: '' }],
    ['three guardians', { guardians: [guardian, guardian, guardian], primaryGuardian: '0' }],
    ['a main contact that does not exist', { guardians: [guardian], primaryGuardian: '1' }],
    ['a guardian with a bad email', { guardians: [{ ...guardian, email: 'x' }], primaryGuardian: '0' }],
  ])('rejects %s', (_label, change) => {
    expect(personalSchema.safeParse({ ...personalBase, ...change }).success).toBe(false)
  })
  it('accepts one guardian chosen as the main contact', () => {
    expect(personalSchema.safeParse({ ...personalBase, guardians: [guardian], primaryGuardian: '0' }).success).toBe(true)
  })
})

const athleticBase = {
  primaryPosition: 'OH',
  secondaryPosition: '',
  heightIn: '',
  standingReachIn: '',
  approachTouchIn: '',
  blockTouchIn: '',
  dominantHand: '' as const,
  clubTeamName: '',
  clubCoachName: '',
  clubCoachEmail: '',
  clubCoachPhone: '',
  hsCoachName: '',
  hsCoachEmail: '',
  awardsText: '',
  statsSummaryText: '',
  aboutMeText: '',
}

describe('athletic tab rules', () => {
  it.each([
    ['no main position', { primaryPosition: '' }],
    ['the same second position', { secondaryPosition: 'OH' }],
    ['a height of 100 inches', { heightIn: '100' }],
    ['a height with a unit', { heightIn: '5ft' }],
    ['a reach of 50 inches', { standingReachIn: '50' }],
    ['a long about-me', { aboutMeText: 'x'.repeat(2001) }],
  ])('rejects %s', (_label, change) => {
    expect(athleticSchema.safeParse({ ...athleticBase, ...change }).success).toBe(false)
  })
  it('accepts measurables inside the database ranges', () => {
    expect(athleticSchema.safeParse({ ...athleticBase, heightIn: '70', standingReachIn: '90', approachTouchIn: '110', blockTouchIn: '105' }).success).toBe(true)
  })
})

const academicBase = {
  hsName: '',
  hsCity: '',
  hsState: '',
  gpaUnweighted: '',
  gpaWeighted: '',
  classRankText: '',
  majorUndecided: false,
  intendedMajors: [],
  actComposite: '',
  plannedTestDatesText: '',
  ncaaEcStatus: '' as const,
  naiaStatus: '' as const,
}

describe('academic tab rules', () => {
  it.each([
    ['a GPA of 4.5', { gpaUnweighted: '4.5' }],
    ['a GPA with three decimals', { gpaUnweighted: '3.456' }],
    ['a weighted GPA of 6', { gpaWeighted: '6' }],
    ['an ACT of 37', { actComposite: '37' }],
    ['four intended majors', { intendedMajors: ['A', 'B', 'C', 'D'] }],
    ['undecided plus a major', { majorUndecided: true, intendedMajors: ['BUSN'] }],
  ])('rejects %s', (_label, change) => {
    expect(academicSchema.safeParse({ ...academicBase, ...change }).success).toBe(false)
  })
  it('accepts values at the edges', () => {
    expect(academicSchema.safeParse({ ...academicBase, gpaUnweighted: '4', gpaWeighted: '5.5', actComposite: '1', intendedMajors: ['A', 'B', 'C'] }).success).toBe(true)
  })
})

describe('highlights tab rules', () => {
  const base = { videos: [], instagramHandle: '', tiktokHandle: '' }
  const video = { id: '', label: 'Hudl', url: 'https://example.com/v' }
  it('allows three videos but not four', () => {
    expect(highlightsSchema.safeParse({ ...base, videos: [video, video, video] }).success).toBe(true)
    expect(highlightsSchema.safeParse({ ...base, videos: [video, video, video, video] }).success).toBe(false)
  })
  it.each([
    ['a link with no scheme', { videos: [{ ...video, url: 'example.com' }] }],
    ['an empty link', { videos: [{ ...video, url: '' }] }],
    ['a handle with a space', { instagramHandle: 'my handle' }],
  ])('rejects %s', (_label, change) => {
    expect(highlightsSchema.safeParse({ ...base, ...change }).success).toBe(false)
  })
})

describe('preferences rules', () => {
  const base = {
    divisions: { NCAA_D1: 'top_choice' as const },
    bands: ['1'],
    playingTime: '' as const,
    regions: [],
    schoolSizes: [],
    controlTypes: [],
    campusSettings: [],
    academicImportance: '' as const,
    costNeed: '' as const,
    interestMajors: [],
    mustHavesText: '',
    dealBreakersText: '',
    idealSchoolText: '',
  }
  it('needs at least one competitiveness level', () => {
    expect(preferencesSchema.safeParse(base).success).toBe(true)
    expect(preferencesSchema.safeParse({ ...base, bands: [] }).success).toBe(false)
  })
  it('refuses levels outside 1 to 6 and unknown regions', () => {
    expect(preferencesSchema.safeParse({ ...base, bands: ['7'] }).success).toBe(false)
    expect(preferencesSchema.safeParse({ ...base, regions: ['Moon'] }).success).toBe(false)
  })
})

describe('graduation year list', () => {
  it('starts this year and covers seven years', () => {
    const years = graduationYears(new Date(2026, 5, 1)).map((y) => y.value)
    expect(years).toEqual(['2026', '2027', '2028', '2029', '2030', '2031', '2032'])
  })
  it('keeps a saved year that has passed', () => {
    expect(graduationYears(new Date(2027, 5, 1), '2026')[0].value).toBe('2026')
  })
})
