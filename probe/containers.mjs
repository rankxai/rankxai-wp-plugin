import { execFileSync } from 'node:child_process'

/*
 * wp-env names its containers after the checkout directory, so a hardcoded name
 * stops resolving the moment the folder is renamed. Every caller here swallows a
 * docker failure — that is correct for `wp option get`, which legitimately fails
 * when the option is unset — so an unresolvable container has to throw instead,
 * or a probe that has lost its oracle reports a pass.
 */

let cached = null

function resolve() {
  if (cached) return cached

  if (process.env.WP_CLI_CONTAINER && process.env.WP_CONTAINER) {
    cached = { cli: process.env.WP_CLI_CONTAINER, wp: process.env.WP_CONTAINER }
    return cached
  }

  let names
  try {
    names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
  } catch (error) {
    throw new Error(`docker is not reachable, so no oracle is available: ${error.message}`)
  }

  // The `-tests-` variants are a second WordPress install; the probes drive the
  // development one.
  const pick = (suffix) =>
    names.find((name) => name.startsWith('wp-env-') && !name.includes('-tests-') && name.endsWith(suffix))

  const cli = process.env.WP_CLI_CONTAINER ?? pick('-cli-1')
  const wp = process.env.WP_CONTAINER ?? pick('-wordpress-1')
  if (!cli || !wp) {
    throw new Error(
      `no wp-env containers are running (saw: ${names.join(', ') || 'none'}). Run \`npx @wordpress/env start\`.`
    )
  }

  cached = { cli, wp }
  return cached
}

export const cliContainer = () => resolve().cli
export const wpContainer = () => resolve().wp
