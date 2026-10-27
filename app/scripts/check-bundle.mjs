// Run after `npm run build`: scans the finished site (dist/) for anything that must never be shipped to a browser.
//  - a Supabase secret key (sb_secret_...) or the words service_role
//  - any JWT whose role is service_role (the legacy "service" key), or any key that is not the public anon role
//  - a database connection string or password-like setting
// It also prints which Supabase address and key kind the build holds, so a wrong project is easy to spot.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'dist'
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(js|mjs|css|html|json|webmanifest|map|txt|svg)$/.test(name)) files.push(path)
  }
}
try {
  walk(root)
} catch {
  console.error('No dist/ folder. Run "npm run build" first.')
  process.exit(1)
}

const problems = []
const notes = new Set()
const jwt = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) problems.push(`${file}: contains a Supabase secret key (sb_secret_...)`)
  if (/service_role/i.test(text)) problems.push(`${file}: mentions service_role`)
  if (/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/i.test(text)) problems.push(`${file}: contains a database connection string`)
  for (const match of text.matchAll(jwt)) {
    let role = '?'
    try {
      role = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')).role ?? 'none'
    } catch {
      continue // not a JWT after all
    }
    if (role === 'anon') notes.add('a legacy public (anon) key')
    else problems.push(`${file}: contains a JWT with role "${role}", only the public "anon" role may ship`)
  }
  if (/sb_publishable_[A-Za-z0-9_-]{8,}/.test(text)) notes.add('a publishable key')
  for (const host of text.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) notes.add(`Supabase project ${host[1]}`)
}

if (problems.length) {
  console.error('BUNDLE CHECK FAILED. Do not deploy.\n' + problems.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log(`Bundle check passed (${files.length} files). Holds: ${[...notes].join(', ') || 'no Supabase settings (built without them)'}.`)
