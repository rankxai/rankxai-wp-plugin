# RankX AI

The site-side connector for [RankX AI](https://rankxai.com), for WordPress sites. It lets a WordPress site be read and
written by the RankX AI platform: publishing approved content, writing SEO metadata through
whichever SEO plugin the site runs, emitting structured data, and serving the machine-readable
documents that AI assistants look for.

The plugin generates nothing on its own. Everything it applies is produced and approved in a
RankX AI account, which is a paid service. The plugin is free and GPLv2 or later.

> ## Status: not on WordPress.org yet
>
> The plugin runs on live sites, but it is not published on WordPress.org, so it installs from a
> [release ZIP](https://github.com/rankxai/rankxai-wp-plugin/releases/latest) rather than from the
> Plugins screen's search. From 0.4.0 an installed copy shows new releases on the Plugins screen
> and can update automatically.

## What it does

| | |
|---|---|
| **SEO metadata** | title, description, canonical, Open Graph and Twitter — through Yoast, Rank Math, SEOPress, All in One SEO or The SEO Framework, or printed by the plugin itself on a site with none |
| **Root documents** | `llms.txt`, `agents.md` and `ai.txt`, served from a virtual route rather than a file on disk, and never taken from a plugin that already serves one |
| **Markdown copies** | off by default: `/page.md`, `/page/index.md`, `/page/?format=md` and `Accept: text/markdown`, plus `sitemap-md.xml` and a `rel="alternate"` link on every page that has one |
| **Structured data** | JSON-LD held in post meta and emitted from `wp_head`, where WordPress's content sanitiser cannot reach it — the page body is never touched |
| **Verified content writes** | the saved bytes come back in the write's own response, with the newest revision id and whether the writing account holds `unfiltered_html` |

Everything above is switched on and fed from a RankX AI account. The plugin exposes the
capability; it never decides what to publish.

## Two things that will not change

Recorded here because they are the reasons to trust the plugin with write access to a live site,
and because writing them down first makes them harder to quietly drop later.

**It is an enhancement, never a requirement.** RankX AI works on a WordPress site with no plugin
installed, over the REST API and an Application Password, and will continue to. The plugin removes
that setup step and unlocks capabilities the REST API cannot express. Nothing in the product will
require it. Agencies frequently cannot install plugins on a client's site, and that is a
constraint to design around rather than argue with.

**It holds no business logic.** It exposes capabilities and does nothing clever with them. Every
rule about what may be written, how content is preserved, and whether a write succeeded lives in
the platform, where it is fixed by a deploy — not in code installed on thousands of sites that
cannot be rolled back. A plugin that decides things is a plugin whose decisions are frozen at
whatever version each site happens to run.

## Development

Requires [Docker](https://www.docker.com/) (for the local WordPress environment) and
[Composer](https://getcomposer.org/).

```sh
composer install      # coding standards toolchain
composer run lint     # PHPCS, WordPress standards + PHP 7.4 compatibility
npx wp-env start      # WordPress at http://localhost:8888 with this plugin active
```

`composer run lint` runs against PHP 7.4 and 8.3 in CI. 7.4 is the declared floor and is in the
matrix deliberately: WordPress.org will install on 7.4 hosts, where an 8.0 syntax feature is a
fatal error on activation rather than a warning.

`npx wp-env start` boots PHP 7.4 for the same reason, with 8.3 in the tests environment.

## Releasing

Sites find updates through the `Update URI` header and `includes/class-rankxai-updater.php`, which
read `rankxai-update.json` from the latest GitHub release and offer that release's `rankxai.zip`.

1. Bump `Version:` and `RANKXAI_VERSION` in `rankxai.php` and `Stable tag:` in `readme.txt`, and add
   a changelog entry for the version (it becomes the release notes and the "View details" text).
2. Commit and push to `main`.
3. `node release.mjs --dry-run`, then `node release.mjs`.

The release is made locally, not by a workflow, so the tag and the release carry the maintainer's
name. The script refuses a dirty or unpushed tree, a version mismatch, a missing changelog entry or
a `Co-Authored-By` trailer, runs `check.sh`, uploads both assets together, and reads the result
back from GitHub. The *Release check* workflow then checks the published release the way a site
will. Never publish a release by hand without `rankxai-update.json`, or mark one as a pre-release
expecting sites to see it: `latest/` skips pre-releases.

`node build-zip.mjs --target=wporg` builds the WordPress.org submission, which has no updater and
no `Update URI` (the directory delivers its own updates, and Plugin Check rejects both). CI's Plugin
Check runs against that build.

## Reporting a security issue

Email [support@rankxai.com](mailto:support@rankxai.com) rather than opening a public issue. See
[SECURITY.md](SECURITY.md), which also lists the things this plugin deliberately never does — the
quickest way to rule a class of report in or out.

## License

GPLv2 or later. See [LICENSE.txt](LICENSE.txt).
