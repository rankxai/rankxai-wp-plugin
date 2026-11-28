#!/usr/bin/env node
/**
 * Build includes/data/crawler-ranges.php from the address ranges each crawler
 * operator publishes, and Cloudflare's own ranges.
 *
 *   node build-crawler-ranges.mjs          fetch and write
 *   node build-crawler-ranges.mjs --check  fail unless the file exists, parses and is under 30 days old
 *
 * Every list must fetch and parse, or nothing is written: a missing list would
 * make every visit from that operator look unconfirmed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const OUT = new URL('./includes/data/crawler-ranges.php', import.meta.url)
const MAX_PREFIXES = 8000
const MAX_AGE_DAYS = 30

const OPENAI = 'https://openai.com'
const ANTHROPIC = 'https://claude.com/crawling/bots.json'
// Crawler id => its operator's published list. Crawlers without a list are matched by name only.
const LISTS = {
  gptbot: `${OPENAI}/gptbot.json`,
  'oai-searchbot': `${OPENAI}/searchbot.json`,
  'chatgpt-user': `${OPENAI}/chatgpt-user.json`,
  claudebot: ANTHROPIC,
  'claude-user': ANTHROPIC,
  'claude-searchbot': ANTHROPIC,
  perplexitybot: 'https://www.perplexity.com/perplexitybot.json',
  'perplexity-user': 'https://www.perplexity.com/perplexity-user.json',
  googlebot: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  bingbot: 'https://www.bing.com/toolbox/bingbot.json',
  applebot: 'https://search.developer.apple.com/applebot.json',
  ccbot: 'https://index.commoncrawl.org/ccbot.json',
}
const CLOUDFLARE = ['https://www.cloudflare.com/ips-v4', 'https://www.cloudflare.com/ips-v6']

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

function isIpv6(addr) {
  if (!/^[0-9a-fA-F:.]+$/.test(addr) || addr.includes(':::')) return false
  if ((addr.startsWith(':') && !addr.startsWith('::')) || (addr.endsWith(':') && !addr.endsWith('::'))) return false
  const doubles = addr.split('::').length - 1
  if (doubles > 1) return false
  const groups = addr.split(':').filter((g) => g !== '')
  if (groups.some((g) => g.length > 4 && !g.includes('.'))) return false
  return doubles === 1 ? groups.length < 8 : groups.length === 8
}

function isValidPrefix(prefix) {
  if (typeof prefix !== 'string' || prefix.length > 64) return false
  const parts = prefix.split('/')
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) return false
  const bits = Number(parts[1])
  if (IPV4.test(parts[0])) return bits <= 32
  if (parts[0].includes(':') && isIpv6(parts[0])) return bits <= 128
  return false
}

function check() {
  if (!existsSync(OUT)) fail('includes/data/crawler-ranges.php is missing. Run: node build-crawler-ranges.mjs')
  const text = readFileSync(OUT, 'utf8')
  const date = /'updated'\s*=>\s*'(\d{4}-\d{2}-\d{2})'/.exec(text)?.[1]
  if (!date) fail('includes/data/crawler-ranges.php has no updated date.')
  const age = (Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86400000
  if (age > MAX_AGE_DAYS) fail(`The crawler ranges are ${Math.floor(age)} days old (from ${date}). Run: node build-crawler-ranges.mjs`)
  console.log(`crawler ranges from ${date}, ${Math.floor(age)} days old`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RankXAI-WordPress-Plugin-Build/1.0 (+https://rankxai.com)', Accept: 'application/json, text/plain' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

function fromPublished(json, url) {
  const list = JSON.parse(json)?.prefixes
  if (!Array.isArray(list)) throw new Error(`${url}: not a range list`)
  const out = []
  for (const entry of list) {
    const p = entry?.ipv4Prefix ?? entry?.ipv6Prefix
    if (isValidPrefix(p)) out.push(p)
  }
  if (!out.length) throw new Error(`${url}: no usable ranges`)
  return out
}

function fromLines(text, url) {
  const out = text.split(/\s+/).map((t) => t.trim()).filter(isValidPrefix)
  if (!out.length) throw new Error(`${url}: no usable ranges`)
  return out
}

function php(value, indent = '') {
  if (Array.isArray(value)) {
    if (!value.length) return 'array()'
    return `array(\n${value.map((v) => `${indent}\t${php(v, `${indent}\t`)},`).join('\n')}\n${indent})`
  }
  if (value && typeof value === 'object') {
    // Keys padded so the arrows line up, as the WordPress coding standard asks.
    const width = Math.max(...Object.keys(value).map((k) => k.length))
    return `array(\n${Object.entries(value).map(([k, v]) => `${indent}\t'${k}'${' '.repeat(width - k.length)} => ${php(v, `${indent}\t`)},`).join('\n')}\n${indent})`
  }
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

async function build() {
  const urls = [...new Set(Object.values(LISTS))]
  const fetched = new Map()
  await Promise.all(urls.map(async (url) => fetched.set(url, fromPublished(await fetchText(url), url))))
  const bots = {}
  for (const [id, url] of Object.entries(LISTS)) bots[id] = [...new Set(fetched.get(url))].sort()
  const proxies = []
  for (const url of CLOUDFLARE) proxies.push(...fromLines(await fetchText(url), url))

  const total = Object.values(bots).reduce((n, l) => n + l.length, 0) + proxies.length
  if (total > MAX_PREFIXES) fail(`${total} ranges, more than ${MAX_PREFIXES}.`)
  const updated = new Date().toISOString().slice(0, 10)
  const version = createHash('sha256').update(JSON.stringify({ bots, proxies })).digest('hex').slice(0, 12)

  const body = php({ updated, version, bots, proxies })
  const file = `<?php
/**
 * The address ranges AI crawler operators publish, and Cloudflare's, as of the date below.
 *
 * Copied from each operator's public list (named in the readme); update the whole list, not single entries.
 *
 * @package RankXAI
 */

defined( 'ABSPATH' ) || exit;

return ${body};
`
  writeFileSync(OUT, file)
  for (const [id, list] of Object.entries(bots)) console.log(`${id.padEnd(18)} ${list.length}`)
  console.log(`cloudflare         ${proxies.length}`)
  console.log(`wrote includes/data/crawler-ranges.php: ${total} ranges, ${updated}, ${version}`)
}

if (process.argv.includes('--check')) check()
else await build()
