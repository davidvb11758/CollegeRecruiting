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
