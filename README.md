# RankX AI – AI Shopping & SEO for WooCommerce

The WordPress plugin for [RankX AI](https://rankxai.com). On a WooCommerce store it shows what AI
shopping answers (ChatGPT, Google's AI Mode) need from your products and, connected to a RankX AI
account, brings RankX AI's store app into wp-admin. On any WordPress site it publishes `llms.txt`,
`agents.md` and markdown copies of pages for AI crawlers, counts AI crawler visits, and checks
internal links.

Free and GPLv2 or later. Everything in this repository runs with no account; a RankX AI account (a
paid service with a free trial) adds what only the service can see and do. What each part does, and
every external request it makes, is in [`readme.txt`](readme.txt).

## What it does

| | |
|---|---|
| **Product check** | on a WooCommerce store, each product checked for what AI shopping answers use (barcode, brand, image and alt text, description, category, price), on the site, with nothing sent anywhere |
| **Markdown copies** | off by default: `/page.md`, `/page/index.md`, `/page/?format=md` and `Accept: text/markdown`, plus `sitemap-md.xml`. A product's copy starts with its price, availability, SKU, barcode, brand and categories |
| **Root documents** | `llms.txt`, `agents.md` and `ai.txt`, served from a virtual route rather than a file on disk, and never taken from a plugin that already serves one |
| **AI crawlers and site checks** | opt-in AI crawler visit counts (no IP address or browser details stored), robots.txt per AI assistant, broken internal links, orphaned pages and missing alt text |
| **SEO metadata** | with an account: title, description, canonical, Open Graph and Twitter, through Yoast, Rank Math, SEOPress, All in One SEO, The SEO Framework, SiteSEO or SureRank, or printed by the plugin itself on a site with none |
| **Structured data** | with an account: per-page JSON-LD joined to the SEO plugin's own graph, or printed by the plugin on a site with none. Held in post meta; the page body is never touched |
| **Store app** | with an account, on a WooCommerce store: RankX AI's store app in wp-admin, built from its readable source in [`admin-app/src`](admin-app/src) with WordPress's own React |

RankX AI also works on a site without this plugin, over the REST API and an Application Password;
the plugin removes that setup step and adds what the REST API cannot do.

## Development

Requires [Docker](https://www.docker.com/), [Composer](https://getcomposer.org/) and Node.js.

```sh
composer install      # coding standards toolchain
composer run lint     # PHPCS: WordPress standards and PHP 7.4 compatibility
npx wp-env start      # WordPress at http://localhost:8888 with this plugin active (PHP 7.4)
bash check.sh         # php -l, PHPCS, guardrails and release-archive contents, as CI runs them
```

CI runs PHPCS on PHP 7.4 (the `Requires PHP` floor) and 8.3, the guardrail scan, and WordPress
Plugin Check against the WordPress.org build.

The scripts in `probe/` test the plugin against the running wp-env; each starts with its usage
line. Run them one at a time, as they share fixtures.

## Building and releasing

```sh
node build-zip.mjs                  # dist/rankxai.zip, the GitHub build with the updater
node build-zip.mjs --target=wporg   # dist/rankxai-wporg.zip, for WordPress.org
```

Both build from committed files only and include the store app built from `admin-app/src`
(`node sync-store-app.mjs` refreshes that source).

Sites update through the `Update URI` header and `includes/class-rankxai-updater.php`, which read
`rankxai-update.json` from the latest GitHub release. To release:

1. Bump `Version:` and `RANKXAI_VERSION` in `rankxai.php` and `Stable tag:` in `readme.txt`, and add
   a changelog entry (it becomes the release notes).
2. Commit and push to `main`.
3. `node release.mjs --dry-run`, then `node release.mjs`.

The script checks the tree and versions, runs `check.sh`, uploads the zip and manifest together,
and reads the release back from GitHub. Do not mark a release as a pre-release: `latest/` skips them.

## Reporting a security issue

Email [support@rankxai.com](mailto:support@rankxai.com) rather than opening a public issue. See
[SECURITY.md](SECURITY.md).

## License

GPLv2 or later. See [LICENSE.txt](LICENSE.txt).
