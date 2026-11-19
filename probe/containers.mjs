import { execFileSync } from 'node:child_process'

/*
 * Finds the wp-env containers, which are named after the checkout directory.
 * Callers ignore docker errors (an unset option fails `wp option get`), so a
 * missing container must throw here rather than read as a pass.
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
