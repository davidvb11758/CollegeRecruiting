import type { ProfileBundle } from '../../lib/profileApi'

/** The profile percentage, straight from the athlete_completeness view so it always matches the database. */
export default function Completeness({ profile }: { profile: ProfileBundle }) {
  const pct = profile.completeness?.pct ?? 0
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">
        Profile {pct}% complete
        {profile.completeness && <span className="font-normal text-muted"> ({profile.completeness.filled} of {profile.completeness.total} items)</span>}
      </p>
      <div
        role="progressbar"
        aria-label="Profile completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded bg-line"
      >
        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
