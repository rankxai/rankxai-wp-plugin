#!/usr/bin/env node
/**
 * Publish a release to GitHub, which is where installed copies look for updates.
 *
 * Run:  node release.mjs [--dry-run]
 *
 * Runs locally, not in Actions, so the tag and the release are the owner's: the
 * tag is made with this checkout's git identity and the release with the `gh`
 * account signed in here. A release made by a workflow is authored by
 * github-actions[bot].
 *
 * What a site needs from a release, and what this checks before and after:
 *   rankxai.zip          the GitHub build, unpacking into `rankxai/`
 *   rankxai-update.json  the manifest the updater reads through `latest/download/`
 * Both are uploaded together, so "latest" never points at a release missing one.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry-run')
const REPO = 'rankxai/rankxai-wp-plugin'
const OWNER_NAME = 'Asif Syed'
const MANIFEST = 'dist/rankxai-update.json'
const ZIP = 'dist/rankxai.zip'

const run = (cmd, args, opts = {}) => (execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...opts }) ?? '').trim()
const die = (msg) => {
  console.error(`\nREFUSED: ${msg}`)
  process.exit(1)
}
const step = (msg) => console.log(`\n== ${msg} ==`)

// ── Versions: one fact in three places ────────────────────────────────────────
const main = readFileSync('rankxai.php', 'utf8')
const readme = readFileSync('readme.txt', 'utf8')
const header = (src, field) => (new RegExp(`^\\s*\\*?\\s*${field}:\\s*(.+)$`, 'im').exec(src) ?? [])[1]?.trim() ?? ''
const version = header(main, 'Version')
const constant = (/define\(\s*'RANKXAI_VERSION',\s*'([^']+)'/.exec(main) ?? [])[1]
const stable = header(readme, 'Stable tag')
const tag = `v${version}`

step(`RankX AI ${version}${DRY ? ' (dry run)' : ''}`)
if (!/^\d+\.\d+\.\d+$/.test(version)) die(`plugin header version "${version}" is not x.y.z — the updater accepts nothing else`)
if (constant !== version || stable !== version) die(`versions disagree: header ${version}, RANKXAI_VERSION ${constant}, Stable tag ${stable}`)
if (header(main, 'Update URI') !== `https://github.com/${REPO}`) die('rankxai.php has no Update URI for this repository, so no site would ever see the release')

// The changelog entry for this version becomes the release notes and the "View details" text.
const entry = new RegExp(`^= ${version.replace(/\./g, '\\.')} =\\s*\\n([^]*?)(?=^= |$(?![^]))`, 'm').exec(readme.split('== Changelog ==')[1] ?? '')
const changelog = (entry?.[1] ?? '').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('* ')).map((l) => l.slice(2))
if (changelog.length === 0) die(`readme.txt has no changelog entry for ${version}`)

// ── Identity and state ────────────────────────────────────────────────────────
const gitName = run('git', ['config', 'user.name'])
if (gitName !== OWNER_NAME) die(`git user.name is "${gitName}", not "${OWNER_NAME}"; the tag would carry the wrong name`)
const ghUser = run('gh', ['api', 'user', '--jq', '.login'])
console.log(`  tag by ${gitName} <${run('git', ['config', 'user.email'])}>, release by GitHub account ${ghUser}`)

if (run('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') die('not on main')
if (run('git', ['status', '--porcelain'])) die('the working tree has uncommitted changes')
run('git', ['fetch', '--tags', 'origin'])
if (run('git', ['rev-parse', 'HEAD']) !== run('git', ['rev-parse', 'origin/main'])) die('HEAD is not origin/main — push first, so the release matches what is public')
if (run('git', ['tag', '--list', tag])) die(`tag ${tag} already exists; bump the version`)
const coAuthored = run('git', ['log', '--format=%B', `-1`]).match(/^Co-Authored-By:.*$/im)
if (coAuthored) die(`the release commit carries "${coAuthored[0]}"; commits in this repository are the owner's alone`)

// ── Build and check ───────────────────────────────────────────────────────────
step('build')
run('node', ['build-zip.mjs'], { stdio: 'inherit' })
run('node', ['build-zip.mjs', '--target=wporg'], { stdio: 'inherit' })
step('check.sh')
run('bash', ['check.sh'], { stdio: 'inherit' })

// "Tested up to: 7.1" means the whole 7.1 branch, but WordPress compares a site's
// full version with it, so 7.1.2 reads as untested. Copies that predate the
// updater's own fix read this value raw, so it carries the branch's latest patch.
const testedBranch = header(readme, 'Tested up to')
let tested = testedBranch
try {
  const offers = (await (await fetch('https://api.wordpress.org/core/version-check/1.7/')).json()).offers ?? []
  const patches = offers.map((o) => o.current).filter((v) => v === testedBranch || String(v).startsWith(`${testedBranch}.`))
  tested = patches.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? testedBranch
} catch {
  console.warn(`  could not read WordPress releases; manifest says tested ${testedBranch}`)
}

const manifest = {
  version,
  requires: header(main, 'Requires at least'),
  requires_php: header(main, 'Requires PHP'),
  tested,
  released: new Date().toISOString().slice(0, 10),
  changelog,
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
const zipHash = createHash('sha256').update(readFileSync(ZIP)).digest('hex')
console.log(`\n${MANIFEST}:\n${readFileSync(MANIFEST, 'utf8')}${ZIP} sha256 ${zipHash}`)

if (DRY) {
  console.log('\nDry run: nothing tagged, pushed or published.')
  process.exit(0)
}

// ── Publish ───────────────────────────────────────────────────────────────────
step(`tag ${tag} and publish`)
run('git', ['tag', '-a', tag, '-m', `RankX AI ${version}`])
run('git', ['push', 'origin', tag], { stdio: 'inherit' })
const notes = changelog.map((l) => `* ${l}`).join('\n')
run('gh', ['release', 'create', tag, ZIP, MANIFEST, '--repo', REPO, '--title', `RankX AI ${version}`, '--notes', notes, '--verify-tag', '--latest'], { stdio: 'inherit' })

// ── Read it back the way a site will ──────────────────────────────────────────
step('verify from GitHub')
const failures = []
const release = JSON.parse(run('gh', ['release', 'view', tag, '--repo', REPO, '--json', 'author,assets,isDraft,isPrerelease']))
if (release.author.login !== ghUser) failures.push(`release author is ${release.author.login}`)
if (release.isDraft || release.isPrerelease) failures.push('release is a draft or pre-release, so latest/ does not point at it')
const tagger = run('git', ['for-each-ref', `refs/tags/${tag}`, '--format=%(taggername)'])
if (tagger !== OWNER_NAME) failures.push(`tag is by ${tagger}`)

// GitHub can take a moment to move latest/ after publishing.
let latest = null
for (let i = 0; i < 6 && latest?.version !== version; i++) {
  if (i) await new Promise((r) => setTimeout(r, 5000))
  const res = await fetch(`https://github.com/${REPO}/releases/latest/download/rankxai-update.json`)
  latest = res.ok ? await res.json() : null
}
if (latest?.version !== version) failures.push(`latest/download/rankxai-update.json reports ${latest?.version}`)
const pkg = await fetch(`https://github.com/${REPO}/releases/download/${tag}/rankxai.zip`)
const pkgHash = pkg.ok ? createHash('sha256').update(Buffer.from(await pkg.arrayBuffer())).digest('hex') : `HTTP ${pkg.status}`
if (pkgHash !== zipHash) failures.push(`the published package is ${pkgHash}, not the built ${zipHash}`)

if (failures.length) die(`published, but:\n  ${failures.join('\n  ')}`)
console.log(`  release by ${release.author.login}, tag by ${tagger}`)
console.log(`  latest/ serves ${latest.version}; the package matches the build byte for byte`)
console.log(`\nDone. Copy ${ZIP} to the platform's public/downloads/rankxai-plugin.zip so the in-product download matches.`)
