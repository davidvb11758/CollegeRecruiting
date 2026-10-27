import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import FilterPanel from '../components/find/FilterPanel'
import ResultCard from '../components/find/ResultCard'
import { Button, Message, OutlineButton, SecondaryButton } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { useConferences, useListEntries, useSearch } from '../lib/collegeHooks'
import { countActive, EMPTY_FILTERS, filtersToParams, parseFilters, type Filters } from '../lib/findFilters'
import { useLookups, useProfile } from '../lib/profileHooks'

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

/** The filters the athlete saved on My College Preferences, as Find Colleges filters. */
function preferenceFilters(preference: Record<string, unknown> | null, divisions: Record<string, unknown>[]): Partial<Filters> | null {
  if (!preference) return null
  return {
    divisions: divisions.filter((d) => d.interest !== 'none').map((d) => String(d.division_code)),
    bands: list(preference.competitiveness_bands),
    sizes: list(preference.school_sizes),
    control: list(preference.control_types),
    settings: list(preference.campus_settings),
  }
}

/** A4: search and filter the college database. Takes the athlete (when there is one) so "On My List" can show. */
export function FindScreen({ base, athleteId }: { base: string; athleteId: string | null }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = useMemo(() => parseFilters(params), [params])
  const [text, setText] = useState(filters.q)
  const lookups = useLookups()
  const conferences = useConferences()
  const search = useSearch(filters)
  const entries = useListEntries(athleteId)
  const profile = useProfile(athleteId ?? '', athleteId !== null)

  const update = (next: Partial<Filters>) => setParams(filtersToParams({ ...filters, ...next }), { replace: true })

  // Going back to an earlier search puts its name back in the box.
  const [seenQ, setSeenQ] = useState(filters.q)
  if (seenQ !== filters.q) {
    setSeenQ(filters.q)
    setText(filters.q)
  }
  // The name box waits for a pause in typing before it searches.
  useEffect(() => {
    if (text.trim() === filters.q.trim()) return
    const timer = setTimeout(() => setParams(filtersToParams({ ...filters, q: text }), { replace: true }), 300)
    return () => clearTimeout(timer)
  }, [text, filters, setParams])

  const onList = useMemo(() => new Set((entries.data ?? []).filter((e) => !e.archived_at).map((e) => e.program_id)), [entries.data])
  const active = countActive(filters)
  const count = search.data?.pages[0]?.count ?? 0
  const rows = search.data?.pages.flatMap((p) => p.rows) ?? []
  const preset = athleteId && profile.data ? preferenceFilters(profile.data.preference, profile.data.divisions) : null

  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Find Colleges</h1>
      <div className="flex flex-col gap-1">
        <label htmlFor="college-search" className="text-sm font-medium">
          Search by college name
        </label>
        <input
          id="college-search"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-11 rounded border border-edge bg-surface px-3 text-base"
        />
      </div>

      <details className="rounded border border-line bg-surface p-3" open={active > 0 || undefined}>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Filters{active > 0 ? ` (${active})` : ''}</summary>
        <div className="flex flex-col gap-4 pt-2">
          {preset && (
            <OutlineButton type="button" onClick={() => update({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort, ...preset })}>
              Match my preferences
            </OutlineButton>
          )}
          {lookups.data ? (
            <FilterPanel filters={filters} onChange={update} lookups={lookups.data} conferences={conferences.data ?? []} />
          ) : (
            <p role="status" className="text-muted">
              Loading filters…
            </p>
          )}
          {(active > 0 || filters.q) && (
            <SecondaryButton
              type="button"
              onClick={() => {
                setText('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Clear all
            </SecondaryButton>
          )}
        </div>
      </details>

      {search.isError ? (
        <div className="flex flex-col gap-3">
          <Message kind="error">We could not load colleges. Check your connection and try again.</Message>
          <Button onClick={() => void search.refetch()}>Try again</Button>
        </div>
      ) : search.isPending ? (
        <p role="status" className="text-muted">
          Searching…
        </p>
      ) : (
        <>
          <p role="status" className="text-sm text-muted">
            {count === 0 ? 'No programs match.' : `${count.toLocaleString('en-US')} program${count === 1 ? '' : 's'}`}
          </p>
          {count === 0 && active + (filters.q ? 1 : 0) > 0 && <p className="text-sm text-muted">Try removing a filter or shortening the name.</p>}
          <ul aria-label="Results" className="flex flex-col gap-2">
            {rows.map((row) => (
              <ResultCard key={String(row.program_id)} row={row} base={base} search={location.search} onList={onList.has(Number(row.program_id))} />
            ))}
          </ul>
          {search.hasNextPage && (
            <Button onClick={() => void search.fetchNextPage()} disabled={search.isFetchingNextPage}>
              {search.isFetchingNextPage ? 'Loading…' : `Show more (${rows.length} of ${count.toLocaleString('en-US')})`}
            </Button>
          )}
        </>
      )}
    </main>
  )
}

export default function Find() {
  const { state } = useAuth()
  const athleteId = state.status === 'signedIn' ? state.account.athleteId : null
  return <FindScreen base="/find" athleteId={athleteId} />
}

export function StaffFind() {
  return <FindScreen base="/staff/find" athleteId={null} />
}
