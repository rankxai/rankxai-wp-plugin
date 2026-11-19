#!/usr/bin/env node
/**
 * Build the distributable plugin ZIP with `git archive`, so it holds exactly the
 * committed tree and honours `.gitattributes` export-ignore. (PowerShell's
 * Compress-Archive writes backslashed entry names, which WordPress unpacks wrongly.)
 *
 * Targets: `github` (default) keeps the Update URI header and the updater;
 * `wporg` removes both, since WordPress.org delivers its own updates.
 *
 * Usage: node build-zip.mjs [--target=github|wporg] [--local] [outfile]
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
const UPDATER_ICONS = ['assets/icon-128x128.png', 'assets/icon-256x256.png']
const UPDATE_URI_LINE = new RegExp('^ \\* Update URI:.*\\n', 'm')
const GITHUB_BLOCK = /^<!-- github-build -->\n[\s\S]*?^<!-- \/github-build -->\n\n?/m
const GITHUB_MARKERS = /^<!-- \/?github-build -->\n/gm
// The same GitHub-only blocks in PHP: the updater's loader and its cache cleanup.
const PHP_GITHUB_BLOCK = /^\/\/ <github-build>\n[\s\S]*?^\/\/ <\/github-build>\n/gm
const PHP_GITHUB_MARKERS = /^\/\/ <\/?github-build>\n/gm
const PHP_WITH_BLOCKS = [`${SLUG}.php`, 'uninstall.php']

mkdirSync(dirname(OUT), { recursive: true })

// `git archive` packages HEAD, so uncommitted edits would silently be missing.
// `--local` only builds the store app into admin-app/build for local use.
const LOCAL = args.includes('--local')
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
if (dirty && !LOCAL && !process.env.RANKXAI_ALLOW_DIRTY_BUILD) {
  console.error('Refusing to build: the working tree has uncommitted changes, and `git archive`')
  console.error('packages HEAD — so those changes would be ABSENT from the zip while every file')
  console.error('in it looked correct. Commit first.\n')
  console.error(dirty)
  console.error('\n(Set RANKXAI_ALLOW_DIRTY_BUILD=1 only if you mean to ship HEAD deliberately.)')
  process.exit(1)
}

// ── The store app ────────────────────────────────────────────────────────────
//
// Built from admin-app/src for both targets, so every zip's bundle comes from the
// source in the same zip. The build output is never committed; it is added to the
// archived tree.
const STORE_SRC = 'admin-app/src'
const STORE_OUT = join(STORE_SRC, 'dist', 'wordpress')
const STORE_ENTRY = 'store-app/hosts/wordpress/main.tsx'
const ASSET_MAP = 'admin-app/build/store-app.asset.php'

function buildStoreApp() {
  if (!existsSync(join(STORE_SRC, 'package.json'))) {
    throw new Error(`${STORE_SRC}/package.json is missing. Run: node sync-store-app.mjs`)
  }
  // No lockfile ships; install only when missing or RANKXAI_STORE_REINSTALL is set.
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
  // The asset map ships as PHP, not JSON, so the plugin never reads a file from disk.
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
 * HEAD's tree plus the store app build, written through a throwaway index so the
 * real one is untouched. For `wporg`, the updater and Update URI are removed.
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
    // The readme's GitHub-only block: unwrapped for github, removed for wporg.
    const readme = execFileSync('git', ['show', 'HEAD:readme.txt'], { encoding: 'utf8' })
    if (!GITHUB_BLOCK.test(readme)) throw new Error('readme.txt has no <!-- github-build --> block')
    add('readme.txt', target === 'wporg' ? readme.replace(GITHUB_BLOCK, '') : readme.replace(GITHUB_MARKERS, ''))
    for (const file of PHP_WITH_BLOCKS) {
      let php = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
      if (!PHP_GITHUB_BLOCK.test(php)) throw new Error(`${file} has no // <github-build> block`)
      PHP_GITHUB_BLOCK.lastIndex = 0
      if (target === 'wporg') {
        php = php.replace(PHP_GITHUB_BLOCK, '')
        if (file === `${SLUG}.php`) {
          if (!UPDATE_URI_LINE.test(php)) throw new Error(`${SLUG}.php has no Update URI line to remove`)
          php = php.replace(UPDATE_URI_LINE, '')
        }
      } else {
        php = php.replace(PHP_GITHUB_MARKERS, '')
      }
      add(file, php)
    }
    // The icons are only shown by the updater; the directory has its own.
    if (target === 'wporg') {
      for (const file of [UPDATER, ...UPDATER_ICONS]) execFileSync('git', ['update-index', '--force-remove', file], { env })
    }
    return execFileSync('git', ['write-tree'], { env, encoding: 'utf8' }).trim()
  } finally {
    rmSync(index, { force: true })
  }
}

const store = buildStoreApp()

if (LOCAL) {
  rmSync('admin-app/build', { recursive: true, force: true })
  mkdirSync('admin-app/build/assets', { recursive: true })
  for (const a of store.assets) writeFileSync(a.path, readFileSync(a.file))
  writeFileSync(ASSET_MAP, store.assetMap)
  console.log(`admin-app/build written for local use (${store.assets.length} assets, entry ${store.entry}).`)
  process.exit(0)
}

// The archive is read from stdout rather than written with -o, which misbehaves with Windows paths.
const zip = execFileSync('git', ['archive', '--format=zip', `--prefix=${SLUG}/`, treeFor(TARGET, store)], {
  maxBuffer: 64 * 1024 * 1024,
})
writeFileSync(OUT, zip)

// Read the central directory back: no backslashed names, and the main file at the right depth.
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

// The github build must carry the updater and Update URI; the wporg build must not.
const hasUpdater = names.includes(`${SLUG}/${UPDATER}`)
const mainFile = execFileSync('unzip', ['-p', OUT, `${SLUG}/${SLUG}.php`], { encoding: 'utf8' })
const hasHeader = UPDATE_URI_LINE.test(mainFile)
const wanted = TARGET === 'github'
if (hasUpdater !== wanted || hasHeader !== wanted) {
  console.error(`${TARGET} build: updater ${hasUpdater ? 'present' : 'absent'}, Update URI ${hasHeader ? 'present' : 'absent'}; both should be ${wanted ? 'present' : 'absent'}`)
  process.exit(1)
}

// The WordPress.org build must not even mention the updater; neither build keeps a marker line.
for (const file of PHP_WITH_BLOCKS) {
  const php = execFileSync('unzip', ['-p', OUT, `${SLUG}/${file}`], { encoding: 'utf8' })
  const mentions = /updater|rankxai_release/i.test(php)
  if (php.includes('github-build') || mentions !== wanted) {
    console.error(`${TARGET} build: ${file} ${php.includes('github-build') ? 'still carries a marker' : `${mentions ? 'mentions' : 'lacks'} the updater`}`)
    process.exit(1)
  }
}

// Both targets carry the store app: its build, its asset map and its source.
const storeMissing = [`${SLUG}/${ASSET_MAP}`, `${SLUG}/${store.entry}`, `${SLUG}/${STORE_SRC}/package.json`, `${SLUG}/${STORE_SRC}/${STORE_ENTRY}`].filter((n) => !names.includes(n))
const leaked = names.filter((n) => n.includes('/.vite/') || n.includes('/node_modules/') || n.startsWith(`${SLUG}/${STORE_SRC}/dist/`))
if (storeMissing.length || leaked.length) {
  console.error(`${TARGET} build: store app ${storeMissing.length ? `missing ${storeMissing.join(', ')}` : ''}${leaked.length ? ` carries ${leaked.slice(0, 3).join(', ')}` : ''}`)
  process.exit(1)
}

// Only the github readme describes the update check, and neither keeps a marker line.
const shippedReadme = execFileSync('unzip', ['-p', OUT, `${SLUG}/readme.txt`], { encoding: 'utf8' })
const mentionsUpdater = shippedReadme.includes('rankxai-update.json')
if (shippedReadme.includes('github-build') || mentionsUpdater !== wanted) {
  console.error(`${TARGET} build: readme ${shippedReadme.includes('github-build') ? 'still carries a marker' : `${mentionsUpdater ? 'describes' : 'omits'} the GitHub update check`}`)
  process.exit(1)
}

console.log(`${OUT} (${TARGET}) — ${names.length} entries, ${buf.length} bytes`)
for (const n of names.filter((n) => !n.endsWith('/')).sort()) console.log(`  ${n}`)
