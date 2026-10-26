import { Link } from 'react-router-dom'
import { bandLabel, controlLabel, formatNumber, placeLabel, selectivityLabel, settingLabel, sizeLabel } from '../../lib/collegeLabels'
import type { Row } from '../../lib/profileApi'

/** One program in the results. The whole card opens the college page. */
export default function ResultCard({ row, base, search, onList }: { row: Row; base: string; search: string; onList: boolean }) {
  const facts = [
    sizeLabel(row.size_band) && `${sizeLabel(row.size_band)}${row.enrollment ? ` (${formatNumber(row.enrollment)})` : ''}`,
    settingLabel(row.campus_setting),
    controlLabel(row.control),
    selectivityLabel(row.selectivity),
  ].filter(Boolean)
  const level = bandLabel(row.competitiveness_band)
  return (
    <li>
      <Link
        to={`${base}/${row.program_id}`}
        state={{ search }}
        className="flex flex-col gap-1 rounded border border-slate-300 bg-white p-3 hover:border-red-900"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">{String(row.college_name)}</span>
          {onList && <span className="shrink-0 rounded bg-red-900 px-2 py-0.5 text-xs font-medium text-white">On My List</span>}
        </span>
        <span className="text-sm text-slate-600">
          {[placeLabel(row.city, row.state), String(row.division_label ?? ''), typeof row.conference === 'string' ? row.conference : ''].filter(Boolean).join(' · ')}
        </span>
        {facts.length > 0 && <span className="text-sm text-slate-600">{facts.join(' · ')}</span>}
        {level && <span className="text-sm text-slate-600">{level}</span>}
      </Link>
    </li>
  )
}
