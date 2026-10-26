import { useId, type ComponentProps, type ReactNode } from 'react'

/** Full-screen centred column used by the signed-out screens. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <p className="text-sm font-medium text-red-900">Rockets College Recruiting</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  )
}

type FieldProps = ComponentProps<'input'> & { label: string; error?: string; hint?: string }

export function Field({ label, error, hint, ...input }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded border border-slate-400 bg-white px-3 text-base"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckboxField({ label, error, ...input }: Omit<ComponentProps<'input'>, 'type'> & { label: string; error?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 size-5 shrink-0"
          {...input}
        />
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={`min-h-11 rounded bg-red-900 px-4 font-medium text-white disabled:opacity-60 ${className}`}
      {...props}
    />
  )
}

export function SecondaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={`min-h-11 rounded border border-slate-400 bg-white px-4 font-medium ${className}`}
      {...props}
    />
  )
}

export function OutlineButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={`min-h-11 rounded border border-red-900 bg-white px-4 font-medium text-red-900 ${className}`}
      {...props}
    />
  )
}

/** A message the person must notice. "error" is announced at once; "info" is a polite status. */
export function Message({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  return kind === 'error' ? (
    <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      {children}
    </p>
  ) : (
    <p role="status" className="rounded border border-slate-300 bg-white p-3 text-sm text-slate-700">
      {children}
    </p>
  )
}

export function Splash({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p role="status" className="text-slate-600">
        {children}
      </p>
    </main>
  )
}

type SelectProps = ComponentProps<'select'> & {
  label: string
  options: { value: string; label: string }[]
  placeholder?: string
  error?: string
}

export function SelectField({ label, options, placeholder, error, ...select }: SelectProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-11 rounded border border-slate-400 bg-white px-2 text-base"
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextAreaField({ label, error, hint, ...area }: ComponentProps<'textarea'> & { label: string; error?: string; hint?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="rounded border border-slate-400 bg-white px-3 py-2 text-base"
        {...area}
      />
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

/** A group of tick boxes that share one form field (react-hook-form returns the ticked values as a list). */
export function CheckboxGroup({
  legend,
  options,
  error,
  hint,
  ...input
}: Omit<ComponentProps<'input'>, 'type' | 'value'> & {
  legend: string
  options: { value: string; label: string }[]
  error?: string
  hint?: string
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" value={o.value} className="size-5" {...input} />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </fieldset>
  )
}

/** Wraps one section's form: the Save button and the saved/failed message. */
export function SectionForm({
  onSubmit,
  saving,
  saved,
  error,
  children,
}: {
  onSubmit: () => void
  saving: boolean
  saved: boolean
  error: string | null
  children: ReactNode
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {children}
      {error && <Message kind="error">{error}</Message>}
      {saved && !error && <Message kind="info">Saved.</Message>}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

/** A group of tick boxes whose ticked values are held by the page (not by a form library). */
export function CheckList({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: string; label: string }[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={value.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
