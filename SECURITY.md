# Security policy

## Reporting a vulnerability

**Email [support@rankxai.com](mailto:support@rankxai.com). Please do not open a public issue.**

A public report discloses the issue on every install before any of them can update.

Include what you did, what happened, and the plugin and WordPress versions. A proof of concept
helps and is not required.

We will acknowledge within three working days and tell you what we intend to do. If we disagree
that something is a vulnerability, we will say so and why.

## Scope

In scope: anything in this repository, and the `rankxai/v1` REST routes it registers.

Out of scope: the RankX AI platform itself (report those to the same address, and say which), and
findings that require an attacker to already hold a WordPress administrator account, who can
install arbitrary plugins anyway.

## What this plugin does not do

If any of this is ever untrue, that is itself a vulnerability:

- **It never writes a byte to disk that came from a request.** Anything written outside a post is a
  compile-time constant in this repository, selected by a fixed enum. There is no parameter through
  which file content, a path, or a server directive can be supplied.
- **No endpoint's `permission_callback` returns true unconditionally**, other than a presence probe
  that returns no version and no site data.
- **It grants no capability the connected account does not already have.**
- **Nothing remote happens until a local administrator connects an account.** Crawler counting,
  markdown copies and generated documents are each off until switched on on the site.
- **Before connecting, it makes no outbound request** other than to its own site (site checks,
  View as AI) and, in the GitHub build only, a check for `rankxai-update.json` in this repository's
  latest release, carrying no site data. The download that check offers is built from the checked
  version number, never taken from that file, and always comes from this repository's releases.
- **After connecting, it calls one host, `https://app.rankxai.com`, at three fixed paths**: a
  ten-minute session for an administrator on the Store page, the IDs of products that changed,
  and the disconnect. Nothing it receives is executed; the store app's HTML is sanitised before
  it is shown.
- **RankX AI's connection cannot change how the site behaves**: it cannot add or remove
  redirects, create webhooks, or publish llms.txt, agents.md or ai.txt the site owner has not
  switched on. Redirects are changed only by a signed-in administrator in wp-admin.
- **Disconnecting, deactivating or deleting it ends RankX AI's access** without RankX AI being
  reachable: the site token and RankX AI's user and Application Password are removed on the site
  itself.

## Supported versions

The current release, on the current and previous minor WordPress versions. There is no long-term
support branch.
