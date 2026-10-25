#!/usr/bin/env node
/**
 * Copy the store app's published source into admin-app/src, or check the two agree.
 *
 * The store app is written in the RankX AI platform repository and published from
 * there as readable source (`npm run build:wordpress-src` writes
 * dist/wordpress-src). This plugin ships that source in admin-app/src, and its
 * zips are built from it, so what ships provably comes from what is published.
 *
 *   node sync-store-app.mjs           publish in the platform repo, then copy here
 *   node sync-store-app.mjs --check   publish in the platform repo, then fail
 *                                     unless admin-app/src is byte-identical
 *
 * The platform checkout is ../rankxai, or RANKXAI_PLATFORM_DIR.
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const CHECK = process.argv.includes('--check')
const HERE = resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const PLATFORM = resolve(process.env.RANKXAI_PLATFORM_DIR ?? join(HERE, '..', 'rankxai'))
const PUBLISHED = join(PLATFORM, 'dist', 'wordpress-src')
const TARGET = join(HERE, 'admin-app', 'src')
// Local build artefacts inside the copy, never part of the source.
const LOCAL = new Set(['node_modules', 'dist'])

function files(dir, root = dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (dir === root && LOCAL.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files(full, root, acc)
    else acc.push(relative(root, full).replace(/\\/g, '/'))
  }
  return acc.sort()
}

if (!existsSync(join(PLATFORM, 'package.json'))) {
  console.error(`No platform checkout at ${PLATFORM}. Set RANKXAI_PLATFORM_DIR.`)
  process.exit(1)
}
console.log(`== publishing the store app source in ${PLATFORM} ==`)
execSync('npm run build:wordpress-src', { cwd: PLATFORM, stdio: 'inherit' })

const published = files(PUBLISHED)
if (published.length < 50 || !published.includes('package.json') || !published.includes('store-app/hosts/wordpress/main.tsx')) {
  console.error(`The published source looks wrong (${published.length} files).`)
  process.exit(1)
}

if (CHECK) {
  const here = files(TARGET)
  const missing = published.filter((f) => !here.includes(f))
  const extra = here.filter((f) => !published.includes(f))
  const changed = published.filter((f) => here.includes(f) && !readFileSync(join(PUBLISHED, f)).equals(readFileSync(join(TARGET, f))))
  if (missing.length || extra.length || changed.length) {
    console.error('admin-app/src differs from the platform’s published source:')
    for (const f of missing) console.error(`  missing  ${f}`)
    for (const f of extra) console.error(`  extra    ${f}`)
    for (const f of changed) console.error(`  changed  ${f}`)
    console.error('Run: node sync-store-app.mjs')
    process.exit(1)
  }
  console.log(`admin-app/src matches the published source (${published.length} files).`)
  process.exit(0)
}

for (const f of files(TARGET)) rmSync(join(TARGET, f))
cpSync(PUBLISHED, TARGET, { recursive: true })
console.log(`admin-app/src now holds the published source (${published.length} files).`)
