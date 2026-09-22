#!/usr/bin/env node
/**
 * Build the distributable plugin ZIP.
 *
 * ── DO NOT REPLACE THIS WITH `Compress-Archive` ────────────────────────────
 *
 * PowerShell 5.1's `Compress-Archive` writes entry names with BACKSLASHES
 * (`rankxai\rankxai.php`). The ZIP specification requires forward slashes, and
 * WordPress's unzipper mis-resolves the path: the first upload of this plugin
 * landed at `rankxai/rankxai/rankxai.php`, two levels deep, where WordPress
 * cannot see it at all — it scans `wp-content/plugins` exactly one level deep.
 * The admin screen said only "Plugin file does not exist", which names the
 * symptom and not the cause, and the plugin does not even appear in the REST
 * plugin list to be deleted.
 *
 * `git archive --format=zip` writes a correct archive, applies `--prefix` for the
 * plugin folder, and honours `.gitattributes` `export-ignore` — so what ships is
 * exactly the release: no CI config, no probe harness, no composer manifest, and
 * nothing uncommitted from the working tree.
 *
 * Two earlier attempts are recorded because both are Windows-specific traps a
 * future reader will otherwise re-enter: GNU tar parses `-f C:\...` as a REMOTE
 * HOST spec ("Cannot connect to C: resolve failed"), and its `-C` wants a POSIX
 * path. Neither is needed now.
 *
 * Usage: node build-zip.mjs [outfile]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = process.argv[2] ?? 'dist/rankxai.zip'
const SLUG = 'rankxai'

mkdirSync(dirname(OUT), { recursive: true })

// Which is the right source for a release and a silent trap while building one.
// Caught 2026-09-21: the plugin version was bumped to 0.2.0, the zip was rebuilt,
// and it contained 0.1.0 — every FILE was present and correct, because the files
// are committed; only the one edit that had not been was missing. The build
// printed a clean 13-entry listing throughout.
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
if (dirty && !process.env.RANKXAI_ALLOW_DIRTY_BUILD) {
  console.error('Refusing to build: the working tree has uncommitted changes, and `git archive`')
  console.error('packages HEAD — so those changes would be ABSENT from the zip while every file')
  console.error('in it looked correct. Commit first.\n')
  console.error(dirty)
  console.error('\n(Set RANKXAI_ALLOW_DIRTY_BUILD=1 only if you mean to ship HEAD deliberately.)')
  process.exit(1)
}

// -o is avoided for the same Windows path reason; the archive comes back on stdout.
const zip = execFileSync('git', ['archive', '--format=zip', `--prefix=${SLUG}/`, 'HEAD'], {
  maxBuffer: 64 * 1024 * 1024,
})
writeFileSync(OUT, zip)

// Read the central directory back and assert the two things that actually broke.
const buf = readFileSync(OUT)
const names = []
// End of central directory record, then walk the central directory entries.
let eocd = buf.length - 22
while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
if (eocd < 0) {
  console.error('not a zip: no end-of-central-directory record')
  process.exit(1)
}
let off = buf.readUInt32LE(eocd + 16)
const count = buf.readUInt16LE(eocd + 10)
for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) break
  const nameLen = buf.readUInt16LE(off + 28)
  const extraLen = buf.readUInt16LE(off + 30)
  const commentLen = buf.readUInt16LE(off + 32)
  names.push(buf.toString('utf8', off + 46, off + 46 + nameLen))
  off += 46 + nameLen + extraLen + commentLen
}

const backslashed = names.filter((n) => n.includes('\\'))
if (backslashed.length) {
  console.error(`backslashes in entry names — WordPress will unpack these wrong: ${backslashed.slice(0, 3).join(', ')}`)
  process.exit(1)
}
if (!names.includes(`${SLUG}/${SLUG}.php`)) {
  console.error(`${SLUG}/${SLUG}.php is not at the expected depth. Entries: ${names.slice(0, 6).join(', ')}`)
  process.exit(1)
}

console.log(`${OUT} — ${names.length} entries, ${buf.length} bytes`)
for (const n of names.filter((n) => !n.endsWith('/')).sort()) console.log(`  ${n}`)
