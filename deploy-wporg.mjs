#!/usr/bin/env node
/**
 * Publish a version to the WordPress.org plugin directory by SVN.
 *
 * Run:  node deploy-wporg.mjs <version> [--dry-run]     (release.mjs --wporg runs it)
 *
 * What it does, from dist/rankxai-wporg.zip (the build with no updater and no
 * Update URI, which Plugin Check passes):
 *   trunk/        replaced with the zip's contents
 *   tags/<ver>/   a copy of trunk
 *   assets/       .wordpress-org/ (banners, icons, screenshots)
 * then one commit, as the directory account in RANKXAI_SVN_USER (the password
 * is read by svn itself, from its own credential store or a prompt).
 *
 * It refuses, naming why, when svn is not installed, no account is named, the
 * slug has no repository yet (the listing has not been approved), the tag
 * already exists, or the zip is not this version.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SLUG = 'rankxai'
const REPO = `https://plugins.svn.wordpress.org/${SLUG}`
const ZIP = 'dist/rankxai-wporg.zip'
const version = process.argv[2]
const DRY = process.argv.includes('--dry-run')
const die = (msg) => {
  console.error(`\nREFUSED: ${msg}`)
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) die('name the version: node deploy-wporg.mjs 0.5.5')
try {
  execFileSync('svn', ['--version', '--quiet'], { stdio: 'pipe' })
} catch {
  die('svn is not installed on this machine. WordPress.org takes plugins by SVN only.')
}
const user = process.env.RANKXAI_SVN_USER
if (!user && !DRY) die('set RANKXAI_SVN_USER to the WordPress.org account that owns the listing')
if (!existsSync(ZIP)) die(`${ZIP} is missing: run node build-zip.mjs --target=wporg`)
const zipVersion = execFileSync('unzip', ['-p', ZIP, `${SLUG}/${SLUG}.php`], { encoding: 'utf8' }).match(/^\s*\*\s*Version:\s*(\S+)/m)?.[1]
if (zipVersion !== version) die(`${ZIP} is ${zipVersion}, not ${version}`)
if (/^\s*\*\s*Update URI:/m.test(execFileSync('unzip', ['-p', ZIP, `${SLUG}/${SLUG}.php`], { encoding: 'utf8' }))) die(`${ZIP} carries an Update URI; it is the GitHub build`)

const work = mkdtempSync(join(tmpdir(), 'rankxai-svn-'))
try {
  try {
    execFileSync('svn', ['checkout', '--depth', 'immediates', REPO, work], { stdio: 'pipe' })
  } catch {
    die(`${REPO} does not exist yet: the listing has not been approved, or the slug is different`)
  }
  execFileSync('svn', ['update', '--set-depth', 'infinity', 'trunk', 'assets'], { cwd: work, stdio: 'pipe' })
  if (existsSync(join(work, 'tags', version))) die(`tags/${version} already exists in the directory`)
  execFileSync('svn', ['update', '--set-depth', 'immediates', 'tags'], { cwd: work, stdio: 'pipe' })
  if (existsSync(join(work, 'tags', version))) die(`tags/${version} already exists in the directory`)

  // trunk: exactly the zip's contents.
  const unpacked = mkdtempSync(join(tmpdir(), 'rankxai-wporg-'))
  execFileSync('unzip', ['-q', ZIP, '-d', unpacked])
  for (const name of readdirSync(join(work, 'trunk'))) if (name !== '.svn') rmSync(join(work, 'trunk', name), { recursive: true, force: true })
  cpSync(join(unpacked, SLUG), join(work, 'trunk'), { recursive: true })
  rmSync(unpacked, { recursive: true, force: true })
  cpSync('.wordpress-org', join(work, 'assets'), { recursive: true })

  execFileSync('svn', ['add', '--force', '--quiet', 'trunk', 'assets'], { cwd: work, stdio: 'inherit' })
  const status = execFileSync('svn', ['status'], { cwd: work, encoding: 'utf8' })
  for (const line of status.split('\n').filter((l) => l.startsWith('!'))) execFileSync('svn', ['delete', '--quiet', line.slice(8).trim()], { cwd: work })
  execFileSync('svn', ['copy', 'trunk', `tags/${version}`], { cwd: work, stdio: 'inherit' })
  console.log(execFileSync('svn', ['status'], { cwd: work, encoding: 'utf8' }).split('\n').slice(0, 40).join('\n'))
  if (DRY) {
    console.log('\nDry run: nothing committed.')
    process.exit(0)
  }
  execFileSync('svn', ['commit', '--username', user, '-m', `RankX AI ${version}`], { cwd: work, stdio: 'inherit' })
  console.log(`\nWordPress.org: ${SLUG} ${version} committed (trunk, tags/${version}, assets).`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
