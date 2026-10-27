import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { todayString } from './lib/forms'
import { makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

function start(path: string, world: Partial<FakeWorld> = {}) {
  const fake = makeFakeSupabase({ session: makeSession(), ...world })
  mocked.client = fake.client
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return fake
}

const yearsAgo = (n: number) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  d.setDate(d.getDate() - 1)
  return todayString(d)
}

const writes = (calls: ReturnType<typeof start>['calls'], table: string, mode?: string) =>
  calls.filter((c) => c.table === table && (!mode || c.mode === mode))

describe('first login', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, dob: string) {
    await screen.findByRole('heading', { name: /create your athlete profile/i })
    await user.type(screen.getByLabelText('Athlete first name'), 'Pat')
    await user.type(screen.getByLabelText('Athlete last name'), 'Player')
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: dob } })
    await user.selectOptions(screen.getByLabelText('Graduation year'), String(new Date().getFullYear() + 2))
    await user.selectOptions(screen.getByLabelText('Home state'), 'IA')
    await user.click(screen.getByRole('button', { name: 'Create profile' }))
  }

  it('creates the athlete record for the only team and opens the profile', async () => {
    const user = userEvent.setup()
    const { calls } = start('/home', { athlete: null })
    await fill(user, yearsAgo(16))
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    const [insert] = writes(calls, 'athlete', 'insert')
    expect(insert.payload).toMatchObject({
      user_id: 'user-1',
      team_id: 'team-1',
      first_name: 'Pat',
      last_name: 'Player',
      home_state: 'IA',
    })
  })

  it('refuses an athlete outside 14 to 18 before anything is saved', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/create', { athlete: null })
    await fill(user, yearsAgo(11))
    expect(await screen.findByText('Athletes must be 14 to 18 years old')).toBeInTheDocument()
    expect(writes(calls, 'athlete')).toHaveLength(0)
  })

  it('shows a readable message when the database refuses', async () => {
    const user = userEvent.setup()
    start('/profile/create', { athlete: null, failWrites: { athlete: { message: 'Athletes must be 14 to 18 years old (date of birth gives 12)', code: '23514' } } })
    await fill(user, yearsAgo(16))
    expect(await screen.findByRole('alert')).toHaveTextContent('Athletes must be 14 to 18 years old.')
  })
})

describe('profile tabs', () => {
  it('opens on Personal with the saved values and the completeness bar from the view', async () => {
    start('/profile', { tables: { athlete_completeness: [{ athlete_id: 'athlete-1', filled: 6, total: 15, pct: 40 }] } })
    expect(await screen.findByLabelText('First name')).toHaveValue('Pat')
    expect(screen.getByLabelText('Home state')).toHaveValue('IA')
    expect(screen.getByRole('progressbar', { name: 'Profile completeness' })).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText(/6 of 15 items/)).toBeInTheDocument()
  })

  it('saves the personal tab and reloads it', async () => {
    const user = userEvent.setup()
    const { calls, tables } = start('/profile/personal')
    const city = await screen.findByLabelText('Home city')
    await user.type(city, 'Des Moines')
    await user.type(screen.getByLabelText('Home ZIP code'), '50309')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(writes(calls, 'athlete', 'update')[0].payload).toMatchObject({ home_city: 'Des Moines', home_zip: '50309', first_name: 'Pat' })
    expect(tables.athlete[0].home_city).toBe('Des Moines')
    expect(await screen.findByLabelText('Home city')).toHaveValue('Des Moines')
  })

  it('shows field errors and writes nothing when a rule is broken', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/personal')
    await user.type(await screen.findByLabelText('Home ZIP code'), '123')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('ZIP code must be 5 digits')).toBeInTheDocument()
    expect(writes(calls, 'athlete')).toHaveLength(0)
  })

  it('adds a guardian as the main contact', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/personal')
    await user.click(await screen.findByRole('button', { name: 'Add a parent or guardian' }))
    await user.type(screen.getByLabelText('Full name'), 'Sam Player')
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_guardian', 'insert')[0].payload).toEqual([
      { athlete_id: 'athlete-1', relationship: 'mother', full_name: 'Sam Player', email: 'sam@example.com', phone: null, ok_to_share: true, is_primary: true },
    ])
  })

  it('hides the add button once two guardians exist', async () => {
    const user = userEvent.setup()
    start('/profile/personal')
    const add = await screen.findByRole('button', { name: 'Add a parent or guardian' })
    await user.click(add)
    await user.click(screen.getByRole('button', { name: 'Add a parent or guardian' }))
    expect(screen.queryByRole('button', { name: 'Add a parent or guardian' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('radio', { name: 'Main contact' })).toHaveLength(2)
  })

  it('demotes the old main contact before promoting the new one', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/personal', {
      tables: {
        athlete_guardian: [
          { id: 'g1', athlete_id: 'athlete-1', relationship: 'mother', full_name: 'Mom', email: null, phone: null, ok_to_share: true, is_primary: true, created_at: 1 },
          { id: 'g2', athlete_id: 'athlete-1', relationship: 'father', full_name: 'Dad', email: null, phone: null, ok_to_share: true, is_primary: false, created_at: 2 },
        ],
      },
    })
    const radios = await screen.findAllByRole('radio', { name: 'Main contact' })
    expect(radios[0]).toBeChecked()
    await user.click(radios[1])
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    const updates = writes(calls, 'athlete_guardian', 'update').map((c) => (c.payload as { is_primary: boolean; full_name: string }))
    expect(updates.map((u) => `${u.full_name}:${u.is_primary}`)).toEqual(['Mom:false', 'Dad:true'])
  })

  it('saves the athletic tab with numbers as numbers', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/athletic')
    await user.selectOptions(await screen.findByLabelText('Main position'), 'OH')
    await user.type(screen.getByLabelText('Height (inches)'), '70')
    await user.type(screen.getByLabelText('Club team name'), 'Rockets 16R')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_athletic', 'upsert')[0].payload).toMatchObject({
      athlete_id: 'athlete-1',
      primary_position: 'OH',
      height_in: 70,
      club_team_name: 'Rockets 16R',
      secondary_position: null,
      standing_reach_in: null,
    })
  })

  it('requires a main position and rejects a height outside 48 to 96 inches', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/athletic')
    await user.type(await screen.findByLabelText('Height (inches)'), '100')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose the main position')).toBeInTheDocument()
    expect(screen.getByText(/Height must be a whole number from 48 to 96/)).toBeInTheDocument()
    expect(writes(calls, 'athlete_athletic')).toHaveLength(0)
  })

  it('saves academics with GPA, today as the GPA date, and the chosen majors', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/academics')
    await user.type(await screen.findByLabelText('GPA (unweighted)'), '3.8')
    await user.click(screen.getByLabelText('Business & management'))
    await user.click(screen.getByLabelText('Engineering'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_academic', 'upsert')[0].payload).toMatchObject({ gpa_unweighted: 3.8, gpa_updated_on: todayString(), major_undecided: false })
    expect(writes(calls, 'athlete_major', 'insert')[0].payload).toEqual([
      { athlete_id: 'athlete-1', major_code: 'BUSN', kind: 'intended' },
      { athlete_id: 'athlete-1', major_code: 'ENGR', kind: 'intended' },
    ])
  })

  it('stops a fourth intended major before saving', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/academics')
    for (const name of ['Business & management', 'Engineering', 'Health professions & nursing', 'Computer & information sciences']) {
      await user.click(await screen.findByLabelText(name))
    }
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose at most 3 intended majors')).toBeInTheDocument()
    expect(writes(calls, 'athlete_academic')).toHaveLength(0)
  })

  it('removes a major when it is unticked', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/academics', {
      tables: { athlete_major: [{ athlete_id: 'athlete-1', major_code: 'BUSN', kind: 'intended' }, { athlete_id: 'athlete-1', major_code: 'COMP', kind: 'intended' }] },
    })
    const busn = await screen.findByLabelText('Business & management')
    await waitFor(() => expect(busn).toBeChecked())
    await user.click(busn)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_major', 'delete')).toHaveLength(1)
    expect(writes(calls, 'athlete_major', 'insert')).toHaveLength(0)
  })

  it('asks for the athletic tab first before social links', async () => {
    start('/profile/highlights')
    expect(await screen.findByText(/Fill in and save the Athletic tab first/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram')).not.toBeInTheDocument()
  })

  it('saves up to three video links and no more', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/highlights', { tables: { athlete_athletic: [{ athlete_id: 'athlete-1', primary_position: 'OH' }] } })
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: 'Add a video link' }))
    expect(screen.queryByRole('button', { name: 'Add a video link' })).not.toBeInTheDocument()
    const links = screen.getAllByLabelText('Link')
    await user.type(links[0], 'https://hudl.com/a')
    await user.type(links[1], 'https://youtu.be/b')
    await user.type(links[2], 'not-a-link')
    await user.type(screen.getByLabelText('Instagram'), 'rocketsvb')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Start the link with http:// or https://')).toBeInTheDocument()
    expect(writes(calls, 'athlete_video_link')).toHaveLength(0)
    await user.clear(links[2])
    await user.type(links[2], 'https://example.com/c')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_video_link', 'insert').map((c) => (c.payload as { sort_order: number }).sort_order)).toEqual([0, 1, 2])
    expect(writes(calls, 'athlete_athletic', 'update')[0].payload).toMatchObject({ instagram_handle: 'rocketsvb' })
  })

  it('shows the database message when a save is refused', async () => {
    const user = userEvent.setup()
    start('/profile/athletic', { failWrites: { athlete_athletic: { message: 'new row violates row-level security policy', code: '42501' } } })
    await user.selectOptions(await screen.findByLabelText('Main position'), 'OH')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to save this')
  })
})

describe('fields hidden in this phase', () => {
  const athletic = { athlete_id: 'athlete-1', primary_position: 'OH', club_level: '16 Open', hs_coach_phone: '515-555-0100' }

  it('the athletic tab has no club level or high school coach phone, and a save never sends them', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/athletic', { tables: { athlete_athletic: [athletic] } })
    await screen.findByLabelText('Main position')
    expect(screen.queryByLabelText('Club level')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('High school coach phone')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Club coach phone')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    const sent = Object.keys(writes(calls, 'athlete_athletic', 'upsert')[0].payload as object)
    expect(sent).not.toContain('club_level')
    expect(sent).not.toContain('hs_coach_phone')
    expect(sent).toContain('club_team_name')
  })

  it('academics has no SAT total, SAT or ACT date, or counselor, and a save never sends them', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/academics')
    await screen.findByLabelText('GPA (unweighted)')
    for (const label of ['SAT total', 'SAT date', 'ACT date', 'School counselor name', 'School counselor email']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    }
    expect(screen.getByLabelText('ACT composite')).toBeInTheDocument()
    await user.type(screen.getByLabelText('GPA (unweighted)'), '3.8')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    const sent = Object.keys(writes(calls, 'athlete_academic', 'upsert')[0].payload as object)
    for (const column of ['sat_total', 'sat_date', 'act_date', 'counselor_name', 'counselor_email']) expect(sent).not.toContain(column)
    expect(sent).toContain('act_composite')
  })

  it('highlights has no X, recruiting profile link or game film link, and a save never sends them', async () => {
    const user = userEvent.setup()
    const { calls } = start('/profile/highlights', { tables: { athlete_athletic: [{ athlete_id: 'athlete-1', primary_position: 'OH' }] } })
    await screen.findByLabelText('Instagram')
    for (const label of ['X (Twitter)', 'Recruiting profile link', 'Game film link']) expect(screen.queryByLabelText(label)).not.toBeInTheDocument()
    expect(screen.getByLabelText('TikTok')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Instagram'), 'rocketsvb')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    const sent = Object.keys(writes(calls, 'athlete_athletic', 'update')[0].payload as object)
    for (const column of ['x_handle', 'external_profile_url', 'game_film_url']) expect(sent).not.toContain(column)
    expect(sent).toContain('instagram_handle')
  })
})

describe('preferences', () => {
  it('is reached from the More tab', async () => {
    const user = userEvent.setup()
    start('/more')
    await user.click(await screen.findByRole('link', { name: 'My College Preferences' }))
    expect(await screen.findByRole('heading', { name: 'My College Preferences' })).toBeInTheDocument()
  })

  it('needs at least one program level', async () => {
    const user = userEvent.setup()
    const { calls } = start('/preferences')
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose at least one level')).toBeInTheDocument()
    expect(writes(calls, 'athlete_preference')).toHaveLength(0)
  })

  it('saves levels, divisions and lists', async () => {
    const user = userEvent.setup()
    const { calls } = start('/preferences')
    await user.click(await screen.findByLabelText('Level 3: next 10%'))
    await user.click(screen.getByLabelText('Level 1: top 10% of programs'))
    await user.click(screen.getByLabelText('NCAA Division I: Top choice'))
    await user.click(screen.getByLabelText('NCAA Division II: Open to'))
    await user.click(screen.getByLabelText('Midwest'))
    await user.click(screen.getByLabelText('Small'))
    await user.selectOptions(screen.getByLabelText('Cost'), 'some_aid')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_preference', 'upsert')[0].payload).toMatchObject({
      athlete_id: 'athlete-1',
      competitiveness_bands: [1, 3],
      preferred_regions: ['Midwest'],
      school_sizes: ['small'],
      cost_need: 'some_aid',
      playing_time_expectation: null,
      academic_importance: null,
      last_reviewed_on: todayString(),
    })
    expect(writes(calls, 'athlete_target_division', 'upsert')[0].payload).toEqual([
      { athlete_id: 'athlete-1', division_code: 'NCAA_D1', interest: 'top_choice' },
      { athlete_id: 'athlete-1', division_code: 'NCAA_D2', interest: 'open_to' },
    ])
  })

  it('removes a division that is set back to not interested', async () => {
    const user = userEvent.setup()
    const { calls } = start('/preferences', {
      tables: {
        athlete_preference: [{ athlete_id: 'athlete-1', competitiveness_bands: [2] }],
        athlete_target_division: [{ athlete_id: 'athlete-1', division_code: 'NCAA_D1', interest: 'open_to' }],
      },
    })
    const radio = await screen.findByLabelText('NCAA Division I: Not interested')
    await user.click(radio)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_target_division', 'delete')).toHaveLength(1)
    expect(writes(calls, 'athlete_target_division', 'upsert')).toHaveLength(0)
  })

  it('shows what was saved before', async () => {
    start('/preferences', {
      tables: {
        athlete_preference: [{ athlete_id: 'athlete-1', competitiveness_bands: [2, 4], preferred_regions: ['South'], cost_need: 'not_a_factor' }],
        athlete_target_division: [{ athlete_id: 'athlete-1', division_code: 'NCAA_D2', interest: 'top_choice' }],
      },
    })
    const levelTwo = await screen.findByLabelText('Level 2: next 10%')
    await waitFor(() => expect(levelTwo).toBeChecked())
    expect(screen.getByLabelText('Level 4: next 10%')).toBeChecked()
    expect(screen.getByLabelText('Level 1: top 10% of programs')).not.toBeChecked()
    expect(screen.getByLabelText('South')).toBeChecked()
    expect(screen.getByLabelText('Cost')).toHaveValue('not_a_factor')
    expect(screen.getByLabelText('NCAA Division II: Top choice')).toBeChecked()
    expect(screen.getByLabelText('NCAA Division I: Not interested')).toBeChecked()
  })
})

describe('staff reuse', () => {
  it('does not give staff the athlete profile route', async () => {
    start('/profile', { appUser: { role: 'staff', display_name: 'Coach' }, athlete: null })
    expect(await screen.findByRole('heading', { name: 'Roster' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByText('Profile')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText('First name')).not.toBeInTheDocument())
  })
})
