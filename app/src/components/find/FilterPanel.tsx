import { BAND_OPTIONS, CONTROL_OPTIONS, SELECTIVITY_OPTIONS, SETTING_OPTIONS, SIZE_OPTIONS, SORTS, type Filters, type SortKey } from '../../lib/findFilters'
import type { ConferenceOption } from '../../lib/collegeApi'
import type { Lookups } from '../../lib/profileApi'
import { CheckList, SelectField } from '../ui'
import StatePicker from './StatePicker'

/** All the Find Colleges filters. Every change goes straight to the page address through onChange. */
export default function FilterPanel({
  filters,
  onChange,
  lookups,
  conferences,
}: {
  filters: Filters
  onChange: (next: Partial<Filters>) => void
  lookups: Lookups
  conferences: ConferenceOption[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <CheckList legend="Division" options={lookups.divisions.map((d) => ({ value: d.code, label: d.label }))} value={filters.divisions} onChange={(divisions) => onChange({ divisions })} />
      <StatePicker states={lookups.states} value={filters.states} onChange={(states) => onChange({ states })} />
      <SelectField
        label="Conference"
        placeholder="Any conference"
        options={conferences.map((c) => ({ value: c.name, label: c.name }))}
        value={filters.conference}
        onChange={(e) => onChange({ conference: e.target.value })}
      />
      <CheckList legend="Public or private" options={CONTROL_OPTIONS} value={filters.control} onChange={(control) => onChange({ control })} />
      <CheckList legend="Program level" options={BAND_OPTIONS} value={filters.bands} onChange={(bands) => onChange({ bands })} />
      <CheckList legend="School size" options={SIZE_OPTIONS} value={filters.sizes} onChange={(sizes) => onChange({ sizes })} />
      <CheckList legend="Campus setting" options={SETTING_OPTIONS} value={filters.settings} onChange={(settings) => onChange({ settings })} />
      <CheckList legend="Admission" options={SELECTIVITY_OPTIONS} value={filters.selectivity} onChange={(selectivity) => onChange({ selectivity })} />
      <SelectField
        label="Major offered"
        placeholder="Any major"
        options={lookups.majors.map((m) => ({ value: m.code, label: m.label }))}
        value={filters.major}
        onChange={(e) => onChange({ major: e.target.value })}
      />
      <SelectField label="Sort by" options={SORTS} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} />
    </div>
  )
}
