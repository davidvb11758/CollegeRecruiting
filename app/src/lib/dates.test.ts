import { addDays, clubToday, diffDays, dueLabel, formatDate } from './dates'
import { sortList } from './listSort'

describe('the club day', () => {
  it('is the Chicago date, not the browser or UTC date', () => {
    // 9 pm on Nov 10 in Chicago is already Nov 11 in UTC
    expect(clubToday(new Date('2026-11-11T03:00:00Z'))).toBe('2026-11-10')
    expect(clubToday(new Date('2026-11-11T07:00:00Z'))).toBe('2026-11-11')
  })
  it('follows daylight saving time', () => {
    expect(clubToday(new Date('2026-07-01T04:30:00Z'))).toBe('2026-06-30') // CDT, UTC-5
    expect(clubToday(new Date('2026-12-01T05:30:00Z'))).toBe('2026-11-30') // CST, UTC-6
  })
})

describe('date arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('counts days between dates', () => {
    expect(diffDays('2026-11-10', '2026-11-08')).toBe(2)
    expect(diffDays('2026-11-08', '2026-11-10')).toBe(-2)
  })
  it('writes dates for people', () => {
    expect(formatDate('2026-11-03', '2026-11-10')).toBe('Nov 3')
    expect(formatDate('2027-01-05', '2026-11-10')).toBe('Jan 5, 2027')
  })
})

describe('due labels', () => {
  const today = '2026-11-10'
  it.each([
    ['2026-11-07', 'Overdue by 3 days', 'overdue'],
    ['2026-11-09', 'Overdue by 1 day', 'overdue'],
    ['2026-11-10', 'Due today', 'soon'],
    ['2026-11-11', 'Due tomorrow', 'soon'],
    ['2026-11-17', 'Due in 7 days', 'soon'],
    ['2026-11-18', 'Due in 8 days', 'later'],
  ])('%s reads %s', (due, text, tone) => {
    expect(dueLabel(due, today)).toEqual({ text, tone })
  })
})

describe('sorting the list', () => {
  const rows = [
    { college_name: 'Beta', priority: 3, days_silent: 40, next_step_due_date: null },
    { college_name: 'Alpha', priority: 1, days_silent: 5, next_step_due_date: '2026-11-12' },
    { college_name: 'Gamma', priority: 1, days_silent: 11, next_step_due_date: '2026-11-08' },
    { college_name: 'Delta', priority: 2, days_silent: 90, next_step_due_date: null },
  ]
  const names = (sort: Parameters<typeof sortList>[1]) => sortList(rows, sort).map((r) => r.college_name)
  it('puts top priorities first, then by name', () => expect(names('priority')).toEqual(['Alpha', 'Gamma', 'Delta', 'Beta']))
  it('puts the longest quiet first', () => expect(names('silent')).toEqual(['Delta', 'Beta', 'Gamma', 'Alpha']))
  it('puts the earliest next step first and colleges without one last', () => expect(names('due')).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']))
  it('sorts by name', () => expect(names('name')).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']))
  it('does not change the original order', () => {
    sortList(rows, 'name')
    expect(rows[0].college_name).toBe('Beta')
  })
})
