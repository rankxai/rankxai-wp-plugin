# Security policy

## Reporting a vulnerability

**Email [support@rankxai.com](mailto:support@rankxai.com). Please do not open a public issue.**

This plugin runs inside other people's WordPress sites, so a public report is a disclosed
vulnerability on every install before any of them can update. Email gives us a window to ship a fix
first; we would rather have it.

Include what you did, what happened, and the plugin and WordPress versions. A proof of concept
helps and is not required.

We will acknowledge within three working days and tell you what we intend to do. If we disagree
that something is a vulnerability we will say so and why, rather than going quiet.

## Scope

In scope: anything in this repository, and the `rankxai/v1` REST routes it registers.

Out of scope: the RankX AI platform itself (report those to the same address, and say which), and
findings that require an attacker to already hold a WordPress administrator account — that
principal can install arbitrary plugins and is not a boundary this code can defend.

## What this plugin deliberately does not do

Stated here because it is the fastest way to rule a class of report in or out, and because if any
of it is ever untrue, that is itself the vulnerability:

- **It never writes a byte to disk that came from a request.** Anything written outside a post is a
  compile-time constant in this repository, selected by a fixed enum. There is no parameter through
  which file content, a path, or a server directive can be supplied.
- **No endpoint's `permission_callback` returns true unconditionally**, other than a presence probe
  that returns no version and no site data.
- **It grants no capability the connected account does not already have.**
- **Every remote capability is inert** until a local administrator enables it, per capability.
- **It makes one outbound request, and only in the GitHub build**: a check for
  `rankxai-update.json` in this repository's latest release, carrying no site data. The
  download it offers is built from the checked version number, never taken from that file, and
  always comes from this repository's releases. The WordPress.org build makes no outbound
  request at all.
- **Every write is reversible** from the plugin's own screen, over SFTP, and on uninstall, without
  RankX AI being reachable.

## Supported versions

The current release, on the current and previous minor WordPress versions. There is no long-term
support branch.
