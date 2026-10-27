import { coachEditSchema, collegeEditSchema } from './masterSchemas'
import { matchesName, sortRoster } from './rosterSort'
import { describeChange } from './staffApi'

const row = (first: string, last: string, extra: Record<string, unknown> = {}) => ({
  athlete_id: first,
  first_name: first,
  last_name: last,
  overdue_count: 0,
  profile_pct: 50,
  last_activity_date: '2026-11-01',
  ...extra,
})

describe('roster sorting', () => {
  const rows = [
    row('Zoe', 'Zimmer', { overdue_count: 1, profile_pct: 95, last_activity_date: '2026-11-09' }),
    row('Pat', 'Player', { overdue_count: 3, profile_pct: 60, last_activity_date: '2026-11-05' }),
    row('Ann', 'Adams', { overdue_count: 0, profile_pct: 20, last_activity_date: null }),
    row('Bea', 'Adams', { overdue_count: 3, profile_pct: 60, last_activity_date: '2026-11-05' }),
  ]
  const names = (sort: Parameters<typeof sortRoster>[1]) => sortRoster(rows, sort).map((r) => r.first_name)

  it('sorts by last name, then first name', () => expect(names('name')).toEqual(['Ann', 'Bea', 'Pat', 'Zoe']))
  it('puts the most overdue first and breaks ties by name', () => expect(names('overdue')).toEqual(['Bea', 'Pat', 'Zoe', 'Ann']))
  it('puts the longest without activity first, and nobody-has-logged-anything before everyone', () =>
    expect(names('quiet')).toEqual(['Ann', 'Bea', 'Pat', 'Zoe']))
  it('puts the least complete profile first', () => expect(names('profile')).toEqual(['Ann', 'Bea', 'Pat', 'Zoe']))
  it('does not change the original order', () => {
    sortRoster(rows, 'name')
    expect(rows[0].first_name).toBe('Zoe')
  })
})

describe('roster name search', () => {
  const pat = row('Pat', 'Player-Smith')
  it('matches the start of any word, in any case', () => {
    expect(matchesName(pat, 'pat')).toBe(true)
    expect(matchesName(pat, 'SMITH')).toBe(false) // "Player-Smith" is one word; a name search is by word start
    expect(matchesName(pat, 'play')).toBe(true)
  })
  it('needs every typed word to match', () => {
    expect(matchesName(pat, 'pat pl')).toBe(true)
    expect(matchesName(pat, 'pat zz')).toBe(false)
  })
  it('matches everyone when nothing is typed', () => expect(matchesName(pat, '   ')).toBe(true))
})

describe('history rows', () => {
  const names = { s1: 'Kim Smith' }
  it('names the coordinator and describes the change in plain words', () => {
    const item = describeChange(
      {
        id: 4,
        table_name: 'athlete_athletic',
        change_type: 'updated',
        new_values: { height_in: 70, club_team_name: 'Rockets', updated_at: 'x', updated_by: 's1' },
        changed_by: 's1',
        changed_by_role: 'staff',
        changed_at: '2026-11-09T15:00:00Z',
      },
      names,
    )
    expect(item).toMatchObject({ who: 'Kim Smith', byStaff: true, area: 'Athletic profile', kind: 'Changed' })
    expect(item.fields).toEqual(['height in', 'club team name'])
  })
  it('says Athlete for the family, Staff for an unnamed coordinator and Automatic for the system', () => {
    const base = { id: 1, table_name: 'next_step', change_type: 'created', new_values: { description: 'x' }, changed_at: '2026-11-09T15:00:00Z' }
    expect(describeChange({ ...base, changed_by: 'u9', changed_by_role: 'athlete' }, names).who).toBe('Athlete')
    expect(describeChange({ ...base, changed_by: 'u8', changed_by_role: 'staff' }, names)).toMatchObject({ who: 'Staff', byStaff: true })
    expect(describeChange({ ...base, changed_by: null, changed_by_role: 'system' }, names)).toMatchObject({ who: 'Automatic', byStaff: false })
  })
  it('reads a removed record from its old values', () => {
    const item = describeChange({ id: 2, table_name: 'athlete_video_link', change_type: 'deleted', old_values: { url: 'https://x.example', label: 'Film' }, new_values: null, changed_by: 's1', changed_by_role: 'staff', changed_at: '2026-11-09T15:00:00Z' }, names)
    expect(item).toMatchObject({ kind: 'Removed', area: 'Video link', fields: ['url', 'label'] })
  })
})

describe('college edit rules', () => {
  const facts = { programUrl: '', questionnaireUrl: '', campsUrl: '', instagramUrl: '', xUrl: '', lastSeasonRecord: '', websiteUrl: '', costUrl: '', status: 'active' as const }
  it('accepts blanks and web links', () => {
    expect(collegeEditSchema.safeParse(facts).success).toBe(true)
    expect(collegeEditSchema.safeParse({ ...facts, programUrl: 'https://school.example.edu/vb' }).success).toBe(true)
  })
  it('refuses a link without http or https', () => {
    expect(collegeEditSchema.safeParse({ ...facts, campsUrl: 'school.example.edu/camps' }).success).toBe(false)
  })
  it('refuses a status the database does not have', () => {
    expect(collegeEditSchema.safeParse({ ...facts, status: 'gone' }).success).toBe(false)
  })
})

describe('coach edit rules', () => {
  const coach = { fullName: 'Casey Coach', title: 'head' as const, email: '', phone: '', staffPageUrl: '', recruitsNote: '', employmentStatus: 'current' as const, isPrimary: false }
  it('needs a name', () => expect(coachEditSchema.safeParse({ ...coach, fullName: '  ' }).success).toBe(false))
  it('checks the email', () => expect(coachEditSchema.safeParse({ ...coach, email: 'not-an-email' }).success).toBe(false))
  it('does not let a coach who left be the main recruiting contact', () => {
    const result = coachEditSchema.safeParse({ ...coach, isPrimary: true, employmentStatus: 'departed' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['isPrimary'])
  })
  it('lets a current coach be the main contact', () => expect(coachEditSchema.safeParse({ ...coach, isPrimary: true }).success).toBe(true))
})
