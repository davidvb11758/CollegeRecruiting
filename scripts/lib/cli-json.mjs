// Reads the JSON that `supabase db query -o json` prints.
//
// The CLI has two shapes: a plain array of rows in an ordinary terminal, and an object {"rows": [...], "warning": ...}
// when it detects it is run by an automated assistant. Both are accepted, so the scripts behave the same everywhere.
// Anything before the JSON (such as "Initialising login role...") is skipped.
export function queryRows(out) {
  const text = String(out ?? '')
  const open = [text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0)
  if (!open.length) throw new Error(`no JSON in the reply: ${text.trim().slice(0, 300) || '(nothing)'}`)
  const start = Math.min(...open)
  const end = text.lastIndexOf(text[start] === '[' ? ']' : '}')
  const parsed = JSON.parse(text.slice(start, end + 1))
  const rows = Array.isArray(parsed) ? parsed : parsed.rows
  if (!Array.isArray(rows)) throw new Error('the reply holds no rows')
  return rows
}
