#!/usr/bin/env node
/**
 * Plan 82 Phase 0 — the top-level RankX AI menu, against a real WordPress.
 *
 * Run:  node probe/verify-admin-menu.mjs      (wp-env must be running)
 *
 * The browser checks (section F, nothing leaves the site) need Playwright. Point
 * PLAYWRIGHT_PATH at an installed `playwright` package; without it that section
 * is reported as NOT RUN, never as passed.
 *
 *   A  the menu and its four pages, for an administrator
 *   B  an editor sees none of them and is refused every one
 *   C  the old Settings address redirects an administrator and refuses an editor
 *   D  the stylesheet and the font load on our pages and nowhere else
 *   E  the same holds when the menu title is translated, and when another
 *      plugin takes position 81 first
 *   F  no request leaves the site while an administrator browses our pages
 */

import { execFileSync } from 'node:child_process'
import { cliContainer } from './containers.mjs'

const BASE = process.env.WP_BASE ?? 'http://localhost:8888'
const MARK = `rx-menu-probe-${Date.now()}`

let pass = 0
let fail = 0
let notRun = 0
const ok = (m) => { console.log(`  PASS  ${m}`); pass++ }
const bad = (m) => { console.log(`  FAIL  ${m}`); fail++ }
const check = (cond, m) => (cond ? ok(m) : bad(m))

function wp(...args) {
  return execFileSync('docker', ['exec', '-u', '33', cliContainer(), 'wp', ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim()
}
function wpSoft(...args) {
  try { return wp(...args) } catch { return null }
}

async function login(user, password) {
  const body = new URLSearchParams({ log: user, pwd: password, 'wp-submit': 'Log In', testcookie: '1' })
  const res = await http(`${BASE}/wp-login.php`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'wordpress_test_cookie=WP%20Cookie%20check' },
    body,
  })
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0])
  if (!cookies.some((c) => c.startsWith('wordpress_logged_in_'))) throw new Error(`login failed for ${user} (${res.status})`)
  return cookies.join('; ')
}
// The rig's Apache occasionally resets a keep-alive connection; retry that, never a status.
async function http(url, init = {}, attempt = 0) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (attempt >= 2) throw e
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    return http(url, init, attempt + 1)
  }
}
async function get(jar, path) {
  const res = await http(`${BASE}${path}`, { headers: { Cookie: jar }, redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') ?? '', html: await res.text() }
}

const PAGES = ['rankxai', 'rankxai-crawlers', 'rankxai-checks', 'rankxai-settings']
const STYLE_ID = "id='rankxai-admin-css'"
const STYLE_RE = new RegExp(`<link[^>]+${STYLE_ID}[^>]+href='([^']+)'`)
const linksTo = (html, page) => html.includes(`page=${page}'`) || html.includes(`page=${page}"`)
const MENU_RE = new RegExp('<li[^>]*id="toplevel_page_rankxai"[^]*?</ul>')

function ourPageHasStyle(html) {
  return html.includes(STYLE_ID)
}

async function assertEnqueueScope(jar, label) {
  for (const page of PAGES) {
    const r = await get(jar, `/wp-admin/admin.php?page=${page}`)
    check(r.status === 200 && ourPageHasStyle(r.html), `${label}: ${page} loads the stylesheet`)
  }
  for (const other of ['/wp-admin/index.php', '/wp-admin/edit.php', '/wp-admin/options-general.php']) {
    const r = await get(jar, other)
    check(r.status === 200 && !ourPageHasStyle(r.html), `${label}: ${other} does not`)
  }
}

async function run() {
  const editor = `${MARK}-ed`
  wp('user', 'create', editor, `${editor}@example.com`, '--role=editor', '--user_pass=probe-pass-123')
  wpSoft('option', 'delete', 'rankxai_probe_menu_fixture')

  try {
    const admin = await login('admin', 'password')
    const ed = await login(editor, 'probe-pass-123')

    // ── A ─────────────────────────────────────────────────────────────────
    console.log('\n== A  the menu, for an administrator ==')
    const dash = await get(admin, '/wp-admin/index.php')
    const menu = MENU_RE.exec(dash.html)?.[0] ?? ''
    check(menu.length > 0, 'a top-level RankX AI item is in the admin menu')
    check(menu.includes('data:image/svg+xml;base64,'), 'with the mark as a recolourable SVG icon')
    for (const page of PAGES) check(linksTo(menu, page), `and a sub-page ${page}`)
    const settingsIdx = dash.html.indexOf('id="menu-settings"')
    const oursIdx = dash.html.indexOf('id="toplevel_page_rankxai"')
    check(settingsIdx > 0 && oursIdx > settingsIdx, 'it sits below Settings, among the tools')
    const plugins = await get(admin, '/wp-admin/plugins.php')
    check(plugins.html.includes('admin.php?page=rankxai-settings'), 'the Plugins screen links Settings to the new page')

    // ── B ─────────────────────────────────────────────────────────────────
    console.log('\n== B  an editor ==')
    const edDash = await get(ed, '/wp-admin/index.php')
    check(edDash.status === 200 && !edDash.html.includes('toplevel_page_rankxai'), 'an editor has no RankX AI menu')
    for (const page of PAGES) {
      const r = await get(ed, `/wp-admin/admin.php?page=${page}`)
      check(r.status === 403 && !r.html.includes('rankxai-app'), `an editor is refused ${page} (${r.status})`)
    }

    // ── C ─────────────────────────────────────────────────────────────────
    console.log('\n== C  the old Settings address ==')
    const old = await get(admin, '/wp-admin/options-general.php?page=rankxai')
    check(old.status === 302 && old.location.endsWith('/wp-admin/admin.php?page=rankxai-settings'), `an administrator is redirected to the new Settings page (${old.status} → ${old.location})`)
    const oldEd = await get(ed, '/wp-admin/options-general.php?page=rankxai')
    check(oldEd.status === 403 && /not allowed/i.test(oldEd.html) && !oldEd.html.includes('rankxai-app'), `an editor ends at core's refusal, never at our page (${oldEd.status})`)

    // ── D ─────────────────────────────────────────────────────────────────
    console.log('\n== D  the stylesheet and the font ==')
    await assertEnqueueScope(admin, 'default')
    const settingsHtml = (await get(admin, '/wp-admin/admin.php?page=rankxai-settings')).html
    const cssUrl = STYLE_RE.exec(settingsHtml)?.[1] ?? ''
    const cssRes = await http(cssUrl.replace(/&#038;/g, '&'))
    const cssText = await cssRes.text()
    check(cssRes.status === 200 && cssText.includes('.rankxai-app'), 'the stylesheet is served')
    const fontUrl = new URL('fonts/Geist-Variable.woff2', cssRes.url).toString()
    const font = await http(fontUrl)
    const fontBytes = (await font.arrayBuffer()).byteLength
    check(font.status === 200 && fontBytes > 60_000, `the bundled font is served from the site itself (${fontBytes} bytes)`)
    check(!/fonts\.googleapis|fonts\.gstatic|cdn\./.test(cssText), 'the stylesheet names no font service or CDN')

    // ── E ─────────────────────────────────────────────────────────────────
    console.log('\n== E  a translated title, and a collision at 81 ==')
    wp('option', 'update', 'rankxai_probe_menu_fixture', 'translate')
    const trDash = await get(admin, '/wp-admin/index.php')
    check(trDash.html.includes('RankX KI Übersetzt'), 'CONTROL — the menu title is translated')
    await assertEnqueueScope(admin, 'translated')
    wp('option', 'update', 'rankxai_probe_menu_fixture', 'collide')
    const coDash = await get(admin, '/wp-admin/index.php')
    check(coDash.html.includes('rankxai-probe-other-81'), 'CONTROL — another plugin registered at position 81')
    check(MENU_RE.test(coDash.html) && PAGES.every((p) => linksTo(MENU_RE.exec(coDash.html)?.[0] ?? '', p)), 'our menu and all four pages are still there')
    wp('option', 'delete', 'rankxai_probe_menu_fixture')

    // ── F ─────────────────────────────────────────────────────────────────
    console.log('\n== F  nothing leaves the site ==')
    let chromium = null
    if (process.env.PLAYWRIGHT_PATH) {
      try {
        const { createRequire } = await import('node:module')
        chromium = createRequire(process.env.PLAYWRIGHT_PATH + '/package.json')('playwright').chromium
      } catch (e) {
        console.log(`  (could not load Playwright from PLAYWRIGHT_PATH: ${e.message})`)
      }
    }
    if (!chromium) {
      console.log('  NOT RUN  set PLAYWRIGHT_PATH to run the browser check')
      notRun++
    } else {
      const browser = await chromium.launch()
      const page = await (await browser.newContext()).newPage()
      await page.goto(`${BASE}/wp-login.php`)
      await page.fill('#user_login', 'admin')
      await page.fill('#user_pass', 'password')
      await page.click('#wp-submit')
      await page.waitForLoadState('networkidle')
      // Core's own admin chrome makes requests of its own (the admin bar's
      // avatar comes from gravatar.com on every screen), so what counts is what
      // our pages request BEYOND a core screen with no plugin content on it.
      let hosts = new Set()
      page.on('request', (req) => hosts.add(new URL(req.url()).host))
      await page.goto(`${BASE}/wp-admin/options-general.php`, { waitUntil: 'networkidle' })
      const baseline = new Set(hosts)
      hosts = new Set()
      for (const p of PAGES) await page.goto(`${BASE}/wp-admin/admin.php?page=${p}`, { waitUntil: 'networkidle' })
      const foreign = [...hosts].filter((h) => h !== new URL(BASE).host && h !== '' && !baseline.has(h))
      check(baseline.has(new URL(BASE).host), `CONTROL — a core screen was measured as the baseline (${[...baseline].join(', ')})`)
      check(hosts.size > 0, `CONTROL — requests were recorded on our pages (${[...hosts].join(', ')})`)
      check(foreign.length === 0, `our pages request nothing beyond what core's own screen does (${foreign.join(', ') || 'none'})`)
      const fontLoaded = await page.evaluate(() => document.fonts.check('14px "RankX Geist"'))
      check(fontLoaded, 'and the bundled font is the one in use')
      await browser.close()
    }
  } finally {
    wpSoft('option', 'delete', 'rankxai_probe_menu_fixture')
    const id = wpSoft('user', 'get', editor, '--field=ID')
    if (id) wpSoft('user', 'delete', id, '--yes')
    check(wpSoft('user', 'get', editor, '--field=ID') === null, 'cleanup — the probe editor is gone')
  }
}

run()
  .catch((e) => { console.error(e); fail++ })
  .finally(() => {
    console.log('\n================================================')
    console.log(`PASSED ${pass}   FAILED ${fail}${notRun ? `   NOT RUN ${notRun}` : ''}`)
    process.exit(fail > 0 ? 1 : 0)
  })
