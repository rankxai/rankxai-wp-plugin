#!/usr/bin/env node
/**
 * Build the distributable plugin ZIP.
 *
 * Not `Compress-Archive`: PowerShell 5.1 writes entry names with backslashes,
 * which the ZIP spec forbids and WordPress's unzipper mis-resolves. The plugin
 * lands a level too deep, where it cannot be seen or deleted, and the admin
 * screen says only "Plugin file does not exist".
 *
 * `git archive --format=zip` writes a correct archive, applies `--prefix` for the
 * plugin folder, and honours `.gitattributes` export-ignore, so what ships is
 * exactly the release and nothing from the working tree.
 *
 * Two targets. `github` (the default) is what the in-product download and a
 * GitHub release ship: it carries the `Update URI` header and the updater, so a
 * site is told about new releases. `wporg` is the WordPress.org submission: the
 * directory delivers its own updates and Plugin Check rejects both, so they are
 * removed. The variant is built from a synthetic git tree, so it still goes
 * through `git archive` and is still exactly a committed state.
 *
 * Usage: node build-zip.mjs [--target=github|wporg] [outfile]
 */
import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const args = process.argv.slice(2)
const TARGET = (args.find((a) => a.startsWith('--target=')) ?? '--target=github').slice('--target='.length)
if (TARGET !== 'github' && TARGET !== 'wporg') {
  console.error(`unknown target "${TARGET}"; use github or wporg`)
  process.exit(1)
}
const OUT = args.find((a) => !a.startsWith('--')) ?? (TARGET === 'wporg' ? 'dist/rankxai-wporg.zip' : 'dist/rankxai.zip')
const SLUG = 'rankxai'
const UPDATER = 'includes/class-rankxai-updater.php'
const UPDATE_URI_LINE = new RegExp('^ \\* Update URI:.*\\n', 'm')

mkdirSync(dirname(OUT), { recursive: true })

// A dirty tree is the wrong source for a release: every file is committed, so
// the listing looks complete while the one uncommitted edit is missing.
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
if (dirty && !process.env.RANKXAI_ALLOW_DIRTY_BUILD) {
  console.error('Refusing to build: the working tree has uncommitted changes, and `git archive`')
  console.error('packages HEAD — so those changes would be ABSENT from the zip while every file')
  console.error('in it looked correct. Commit first.\n')
  console.error(dirty)
  console.error('\n(Set RANKXAI_ALLOW_DIRTY_BUILD=1 only if you mean to ship HEAD deliberately.)')
  process.exit(1)
}

// ── The store app (plan 90d D2) ──────────────────────────────────────────────
//
// admin-app/src is the store app's published source (sync-store-app.mjs copies
// it from the platform). It is built HERE, from that copy, for both targets, so
// the bundle in every zip is provably made from the source in the same zip
// (guideline 4). The build output is never committed: it is injected into the
// archived tree, the same way the wporg target edits the tree.
const STORE_SRC = 'admin-app/src'
const STORE_OUT = join(STORE_SRC, 'dist', 'wordpress')
const STORE_ENTRY = 'store-app/hosts/wordpress/main.tsx'
const ASSET_MAP = 'admin-app/build/store-app.asset.php'

function buildStoreApp() {
  if (!existsSync(join(STORE_SRC, 'package.json'))) {
    throw new Error(`${STORE_SRC}/package.json is missing. Run: node sync-store-app.mjs`)
  }
  // `npm install` with the exact versions the source names (no lockfile ships,
  // as published). Skipped when already installed, unless asked.
  if (!existsSync(join(STORE_SRC, 'node_modules', 'vite')) || process.env.RANKXAI_STORE_REINSTALL) {
    execSync('npm install --no-audit --no-fund --no-package-lock', { cwd: STORE_SRC, stdio: 'inherit' })
  }
  execSync('npm run build', { cwd: STORE_SRC, stdio: 'inherit' })
  const manifest = JSON.parse(readFileSync(join(STORE_OUT, '.vite', 'manifest.json'), 'utf8'))
  const entry = manifest[STORE_ENTRY]
  if (!entry || !entry.file || !entry.isEntry) throw new Error(`the build manifest has no entry for ${STORE_ENTRY}`)
  const assets = readdirSync(join(STORE_OUT, 'assets')).sort()
  for (const f of [entry.file, ...(entry.css ?? [])]) {
    if (!assets.includes(f.replace(/^assets\//, ''))) throw new Error(`the build manifest names ${f}, which was not built`)
  }
  const version = createHash('sha256').update(readFileSync(join(STORE_OUT, '.vite', 'manifest.json'))).digest('hex').slice(0, 12)
  // The PHP the plugin reads: it may not read JSON from disk (check.sh refuses a
  // shipped .json, and the guardrail counts file_get_contents as outbound).
  const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  const assetMap = [
    '<?php',
    '/**',
    ' * The store app build: its entry module, stylesheets and version.',
    ' *',
    ' * Written by build-zip.mjs from the build manifest; never edited by hand.',
    ' *',
    ' * @package RankXAI',
    ' */',
    '',
    "defined( 'ABSPATH' ) || exit;",
    '',
    'return array(',
    `\t'file'    => ${php(entry.file)},`,
    `\t'css'     => array( ${(entry.css ?? []).map(php).join(', ')} ),`,
    `\t'version' => ${php(version)},`,
    ');',
    '',
  ].join('\n')
  return { assets: assets.map((f) => ({ path: `admin-app/build/assets/${f}`, file: join(STORE_OUT, 'assets', f) })), assetMap, entry: `admin-app/build/${entry.file}` }
}

/**
 * The tree to archive: HEAD's tree, written through a throwaway index so the
 * real one is untouched, with the store app's build added. For `wporg`, also
 * the updater removed and the header line dropped.
 */
function treeFor(target, store) {
  const index = join(tmpdir(), `rankxai-${target}-index-${process.pid}`)
  const env = { ...process.env, GIT_INDEX_FILE: index }
  const add = (path, input) => {
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { input, env }).toString('utf8').trim()
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { env })
  }
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { env })
    for (const a of store.assets) add(a.path, readFileSync(a.file))
    add(ASSET_MAP, store.assetMap)
    if (target === 'wporg') {
      execFileSync('git', ['update-index', '--force-remove', UPDATER], { env })
      const main = execFileSync('git', ['show', `HEAD:${SLUG}.php`], { encoding: 'utf8' })
      if (!UPDATE_URI_LINE.test(main)) throw new Error(`${SLUG}.php has no Update URI line to remove`)
      add(`${SLUG}.php`, main.replace(UPDATE_URI_LINE, ''))
    }
    return execFileSync('git', ['write-tree'], { env, encoding: 'utf8' }).trim()
  } finally {
    rmSync(index, { force: true })
  }
}

const store = buildStoreApp()

// -o is avoided for the same Windows path reason; the archive comes back on stdout.
const zip = execFileSync('git', ['archive', '--format=zip', `--prefix=${SLUG}/`, treeFor(TARGET, store)], {
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

// The two targets differ in exactly two places, and each must be the right way round:
// a GitHub build without them never updates, a WordPress.org build with them is rejected.
const hasUpdater = names.includes(`${SLUG}/${UPDATER}`)
const mainFile = execFileSync('unzip', ['-p', OUT, `${SLUG}/${SLUG}.php`], { encoding: 'utf8' })
const hasHeader = UPDATE_URI_LINE.test(mainFile)
const wanted = TARGET === 'github'
if (hasUpdater !== wanted || hasHeader !== wanted) {
  console.error(`${TARGET} build: updater ${hasUpdater ? 'present' : 'absent'}, Update URI ${hasHeader ? 'present' : 'absent'}; both should be ${wanted ? 'present' : 'absent'}`)
  process.exit(1)
}

// Both targets carry the store app: its build, its asset map, and its source (R1-32).
const storeMissing = [`${SLUG}/${ASSET_MAP}`, `${SLUG}/${store.entry}`, `${SLUG}/${STORE_SRC}/package.json`, `${SLUG}/${STORE_SRC}/${STORE_ENTRY}`].filter((n) => !names.includes(n))
const leaked = names.filter((n) => n.includes('/.vite/') || n.includes('/node_modules/') || n.startsWith(`${SLUG}/${STORE_SRC}/dist/`))
if (storeMissing.length || leaked.length) {
  console.error(`${TARGET} build: store app ${storeMissing.length ? `missing ${storeMissing.join(', ')}` : ''}${leaked.length ? ` carries ${leaked.slice(0, 3).join(', ')}` : ''}`)
  process.exit(1)
}

console.log(`${OUT} (${TARGET}) — ${names.length} entries, ${buf.length} bytes`)
for (const n of names.filter((n) => !n.endsWith('/')).sort()) console.log(`  ${n}`)
