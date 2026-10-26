import { SecondaryButton, SelectField } from '../ui'

/** Pick any number of states: choose one from the list to add it, tap a chip to remove it. */
export default function StatePicker({
  states,
  value,
  onChange,
}: {
  states: { code: string; name: string }[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const nameOf = (code: string) => states.find((s) => s.code === code)?.name ?? code
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label="State"
        placeholder="Add a state…"
        options={states.filter((s) => !value.includes(s.code)).map((s) => ({ value: s.code, label: s.name }))}
        value=""
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
      />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Chosen states">
          {value.map((code) => (
            <li key={code}>
              <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => onChange(value.filter((c) => c !== code))}>
                {nameOf(code)} ✕<span className="sr-only"> remove</span>
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
