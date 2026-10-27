import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ATHLETE_ROW, makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

expect.extend(axeMatchers)

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

type Row = Record<string, unknown>

// The accessibility baseline: every main screen, rendered with realistic data, is checked by axe-core for the problems a
// machine can find (missing labels, bad roles, duplicate ids, unreachable controls). Colour contrast cannot be measured in
// a simulated browser, so it is covered by the hand check in guides/RUNBOOK.md; touch sizes are fixed by the shared controls.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T18:00:00Z') })
})
afterEach(() => {
  vi.useRealTimers()
})

const ATH = 'athlete-1'
const L1: Row = {
  list_id: 'L1', athlete_id: ATH, program_id: 1, unitid: 1001, college_name: 'Alpha University', city: 'Testville', state: 'IA', division_code: 'NCAA_D3',
  priority: 1, stage: 'contacted', closed_reason: null, added_on: '2026-10-01', main_coach_id: 11, archived_at: null, last_activity_date: '2026-11-05',
  next_step_id: 'n1', next_step_description: 'Follow up with Coach Lee', next_step_due_date: '2026-11-08', days_silent: 5,
}
const program: Row = {
  program_id: 1, unitid: 1001, college_name: 'Alpha University', program_name: 'Alpha', city: 'Testville', state: 'IA', division_code: 'NCAA_D3',
  division_label: 'NCAA Division III', division_sort: 3, conference: 'Big Test', control: 'public', campus_setting: 'urban', enrollment: 20000,
  size_band: 'large', selectivity: 'selective', division_rank: 14, competitiveness_band: 2, status: 'active', last_verified_on: '2026-10-01', major_codes: ['BUSN'],
  program_url: 'https://alpha.example.edu/vb', website_url: 'https://alpha.example.edu',
}
const coaches: Row[] = [
  { id: 11, program_id: 1, full_name: 'Casey Coach', title: 'head', email: 'casey@alpha.example.edu', phone: '515-555-0101', is_primary_recruiting_contact: true, employment_status: 'current', owner_athlete_id: null },
  { id: 12, program_id: 1, full_name: 'My Own Contact', title: 'assistant', email: null, employment_status: 'current', owner_athlete_id: ATH },
]

const tables: Record<string, Row[]> = {
  my_list: [L1],
  athlete_college: [{ id: 'L1', athlete_id: ATH, program_id: 1, priority: 1, stage: 'contacted', closed_reason: null, main_coach_id: 11, why_i_like_text: 'Great campus', notes_text: null, questionnaire_completed_on: null, archived_at: null }],
  program_search: [program],
  college_program: [{ id: 1, unitid: 1001, program_url: 'https://alpha.example.edu/vb', camps_url: null, status: 'active', last_season_record: '20-10', last_verified_on: '2026-10-01', verified_by: 's1' }],
  college: [{ unitid: 1001, admit_rate: 0.64, website_url: 'https://alpha.example.edu', cost_url: null }],
  college_coach: coaches,
  next_steps_due: [{ next_step_id: 'n1', athlete_id: ATH, list_id: 'L1', college_name: 'Alpha University', description: 'Follow up with Coach Lee', due_date: '2026-11-08', created_source: 'staff', bucket: 'overdue' }],
  next_step: [{ id: 'n1', athlete_id: ATH, athlete_college_id: 'L1', description: 'Follow up with Coach Lee', due_date: '2026-11-08', step_type_code: 'follow_up', status: 'open', created_source: 'athlete', created_at: '2026-11-01T00:00:00Z' }],
  activity_entry: [{ id: 'a1', athlete_id: ATH, athlete_college_id: 'L1', activity_date: '2026-11-05', activity_type_code: 'email', direction: 'i_contacted', summary: 'Sent intro email', source: 'athlete', created_at: '2026-11-05T10:00:00Z', deleted_at: null }],
  activity_type: [
    { code: 'email', label: 'Email', requires_direction: true, user_selectable: true, sort_order: 1 },
    { code: 'other_note', label: 'Other note', requires_direction: false, user_selectable: true, sort_order: 2 },
  ],
  next_step_type: [{ code: 'follow_up', label: 'Follow up', suggested_text: 'Follow up with the coach', sort_order: 1 }],
  app_setting: [{ key: 'silent_days', value: '21' }],
  athlete_completeness: [{ athlete_id: ATH, filled: 9, total: 15, pct: 60 }],
  athlete_athletic: [{ athlete_id: ATH, primary_position: 'OH', height_in: 70 }],
  athlete_academic: [{ athlete_id: ATH, hs_name: 'Test High', hs_state: 'IA', gpa_unweighted: 3.8 }],
  athlete_preference: [{ athlete_id: ATH, competitiveness_bands: [1, 2], school_sizes: ['small'], control_types: [], campus_settings: [], preferred_regions: [] }],
  athlete_target_division: [{ athlete_id: ATH, division_code: 'NCAA_D3', interest: 'top_choice' }],
  athlete_guardian: [{ id: 'g1', athlete_id: ATH, relationship: 'mother', full_name: 'Sam Player', email: 'sam@example.com', is_primary: true, ok_to_share: true, created_at: '2026-10-01' }],
  athlete_video_link: [{ id: 'v1', athlete_id: ATH, label: 'Highlights', url: 'https://video.example.com/1', sort_order: 1 }],
  staff_roster: [{ athlete_id: ATH, first_name: 'Pat', last_name: 'Player', team_name: 'Iowa Rockets 16R', graduation_year: 2029, profile_pct: 60, colleges_count: 1, last_activity_date: '2026-11-05', overdue_count: 1 }],
  staff_profile: [{ user_id: 's1', first_name: 'Kim', last_name: 'Smith' }],
  note_thread: [
    { note_id: 'nt1', athlete_id: ATH, athlete_name: 'Pat Player', sender: 'staff', sender_name: 'Kim Smith', kind: 'note', body: 'Please send me your new film', created_at: '2026-11-09T15:00:00Z', for_me: true, dismissed: false, mine: false },
    { note_id: 'nt2', athlete_id: ATH, athlete_name: 'Pat Player', sender: 'athlete', sender_name: 'Pat Player', kind: 'question', body: 'Which camps should I do?', created_at: '2026-11-08T15:00:00Z', for_me: false, dismissed: false, mine: true },
  ],
  change_history: [{ id: 1, athlete_id: ATH, table_name: 'athlete', record_id: ATH, change_type: 'updated', new_values: { jersey_number: '7' }, changed_by: 's1', changed_by_role: 'staff', changed_at: '2026-11-09T15:00:00Z' }],
}

function show(path: string, world: Partial<FakeWorld> = {}) {
  const fake = makeFakeSupabase({ session: makeSession(), tables, ...world })
  mocked.client = fake.client
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

/** Waits for the screen to finish loading (the text appears and no "Loading" is left), then checks it. */
async function check(container: HTMLElement, ready: string | RegExp) {
  await screen.findAllByText(ready)
  await waitFor(() => expect(screen.queryByText(/^(Loading|Searching)/)).not.toBeInTheDocument())
  const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
  expect(results).toHaveNoViolations()
}

describe('accessibility: signed out', () => {
  it.each([
    ['/sign-in', 'Sign in'],
    ['/sign-up', 'Create your account'],
    ['/forgot-password', /Reset your password|Forgot/],
    ['/session-expired', /session/i],
    ['/nowhere', 'Page not found'],
  ] as const)('%s', async (path, ready) => {
    const { container } = show(path, { session: null })
    await check(container, ready)
  })
})

describe('accessibility: athlete screens', () => {
  it.each([
    ['/home', 'Overdue'],
    ['/list', 'Alpha University'],
    ['/list/L1/overview', 'Priority'],
    ['/list/L1/activity', 'Sent intro email'],
    ['/list/L1/contacts', 'Casey Coach'],
    ['/find', /1 program/],
    ['/find/1', 'About the school'],
    ['/profile/personal', 'Home city'],
    ['/profile/athletic', 'Main position'],
    ['/profile/academics', 'High school city'],
    ['/profile/highlights', 'Highlights'],
    ['/preferences', 'My College Preferences'],
    ['/more', 'Change password'],
    ['/notes', 'Conversation'],
  ] as const)('%s', async (path, ready) => {
    const { container } = show(path)
    await check(container, ready)
  })

  it('the first-login screen', async () => {
    const { container } = show('/profile/create', { athlete: null })
    await check(container, 'Create your athlete profile')
  })

  it('a form with errors showing', async () => {
    const user = userEvent.setup()
    const { container } = show('/profile/personal')
    await user.type(await screen.findByLabelText('Home ZIP code'), '12')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('ZIP code must be 5 digits')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('the log-an-activity form', async () => {
    const user = userEvent.setup()
    const { container } = show('/list/L1/activity')
    await user.click(await screen.findByRole('button', { name: /Log/ }))
    await screen.findByRole('form')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('accessibility: staff screens', () => {
  const staff: Partial<FakeWorld> = {
    appUser: { role: 'staff', display_name: 'Coach Kim' },
    athlete: null,
    tables: { ...tables, athlete: [{ ...ATHLETE_ROW, id: ATH, user_id: 'user-9' }], team: [{ id: 'team-1', name: 'Iowa Rockets 16R' }] },
  }
  it.each([
    ['/staff', 'Pat Player'],
    ['/staff/athlete/athlete-1/home', /Editing Pat Player/],
    ['/staff/athlete/athlete-1/history', 'Changed: Personal details'],
    ['/staff/athlete/athlete-1/notes', 'Conversation'],
    ['/staff/find/1', 'Staff tools'],
  ] as const)('%s', async (path, ready) => {
    const { container } = show(path, staff)
    await check(container, ready)
  })

  it('the college edit forms', async () => {
    const user = userEvent.setup()
    const { container } = show('/staff/find/1', staff)
    await user.click(await screen.findByRole('button', { name: 'Edit college information' }))
    await user.click(await screen.findByRole('button', { name: 'Add a coach' }))
    await screen.findByRole('form', { name: 'Add a coach' })
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('the error screen', () => {
  it('replaces a crashed screen with a plain message and a way back, and tells nobody', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Broken = () => {
      throw new Error('boom')
    }
    const { container } = render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent('boom')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
    quiet.mockRestore()
  })

  it('leaves a healthy screen alone', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })
})
