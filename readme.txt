=== RankX AI – AI Shopping & SEO ===
Contributors: rankxai
Tags: woocommerce, ai shopping, seo, ai crawlers, ai search
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

See what your products are missing for ChatGPT and Google's AI shopping answers, and give AI crawlers a clean copy of every product and page.

== Description ==

Shoppers ask ChatGPT, Gemini and Google's AI Mode what to buy. The answers pick products whose details they can read: a barcode, a brand, a clear description, a price. RankX AI shows a WooCommerce store what those answers need, and helps fix what keeps its products out.

= Free, with no account =

* **Product check.** Checks every published product for a barcode (GTIN, UPC, EAN or ISBN), brand, main image and alt text, description, category and price, and lists each one with something missing and where to fix it. Nothing is sent anywhere.
* **Markdown copies.** A plain-text copy of each page at its own address (`/product/blue-mug.md`), with product facts first and an optional few lines you write about your business. Copies carry `noindex`. Off until you switch them on.
* **llms.txt, agents.md and ai.txt** at your site's root: written by you in Settings, or llms.txt and agents.md generated from your site (a short guide; the `rankxai_llms_txt_limits` filter sets its length). What you write is always what is served. Nothing is written to your server. Off until you switch each on.
* **AI crawler visits.** Which AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) read which pages, per day, for up to 35 days, checked against the address ranges each operator publishes. The ranges ship with the plugin. Off until you switch it on. No IP address or browser details are stored.
* **robots.txt, per AI assistant**, with the line that decides it. Two Site Health tests report the same.
* **Site checks.** Broken internal links, pages nothing links to and images with no alt text, every result listed. A missing address gets an "Add redirect" button.
* **Redirects.** Add one, import a CSV file or download them all, in Settings. Each is added only once its old address shows "page not found", into the Redirection plugin, Rank Math or this plugin's own list.
* **View as AI**, under any post, page or product: what an assistant is given.
* **SEO tags with no SEO plugin.** Tick a meta description, Open Graph and Twitter tags, the sitemap or breadcrumbs in Settings, and set a page's search title, description, link previews and noindex in its edit screen.
* **Structured data.** A JSON-LD box on posts, pages and products.

= With a RankX AI account =

[RankX AI](https://rankxai.com) is a paid service with a 7-day free trial ([pricing](https://rankxai.com/pricing)). Connect from RankX AI › Store and the Store page runs RankX AI's store app:

* Which of your products ChatGPT, Google's AI Mode and other assistants show for shoppers' questions, and which stores they show instead.
* Product details fixed one at a time or in bulk, each shown before it is changed (or by a template you switch on), with Undo.
* Product images, search titles and descriptions, and blog articles written for your store. Nothing is published until you approve it.
* Redirects for deleted products and broken links, suggested and then added by you. RankX AI's connection reads redirects but never adds or removes one.

Anything that uses credits shows its price first. With an SEO plugin, search titles and descriptions go into its own fields.

= Source code and build =

The store app runs from `admin-app/build`. Its full source is in `admin-app/src`, and at https://github.com/rankxai/rankxai-wp-plugin. With Node.js 20.19 or later, run `npm ci && npm run build` in `admin-app/src`: `package-lock.json` pins the tools, so the output in `dist/wordpress/assets` matches `admin-app/build/assets` byte for byte, and `admin-app/build/store-app.asset.php` names the entry file and stylesheet from `dist/wordpress/.vite/manifest.json` (its `version` is the first 12 characters of that manifest's SHA-256). The crawler address ranges in `includes/data/crawler-ranges.php` are built from each operator's public list by `build-crawler-ranges.mjs` in the repository.

== Installation ==

1. Install from Plugins › Add New and activate it.
2. Open **RankX AI** in the admin menu and follow "Start here".
3. On a store, open **RankX AI › Store** for the product check.
4. Optional: click **Connect RankX AI** to connect an account.

== Frequently Asked Questions ==

= Do I need a RankX AI account? =

No. Everything under "Free, with no account" works without one.

= What does connecting give RankX AI access to? =

You approve it on a screen in wp-admin. That creates a user called "RankX AI" with its own role and an Application Password only RankX AI holds.

It can create, edit and publish posts, pages, media and products and their categories and tags (including status, address and parent, and a product's price and stock), and move them to the trash. It can read redirects and WooCommerce's settings and status. It cannot change a page's template, trash, unpublish, move or hide from search engines the front page, posts page, privacy policy or store pages, add or remove redirects, change any settings or webhooks, switch this plugin's features on or off, install plugins or themes, manage users, or sign in to wp-admin. The password works only through the REST API and an allow list (posts, pages, products, media, their categories and tags, this plugin's routes, and reading), cannot post unfiltered HTML and cannot delete permanently. Orders, customers, users, reviews and full comments stay off until you allow them in RankX AI › Settings, and are then read only.

**Disconnect** in RankX AI › Settings, or deactivating the plugin, removes the user and its password.

= What happens if I uninstall it? =

The connection, user and password are removed. Unless you tick "Keep RankX AI's settings and data" in Settings, its settings, counts and cached copies are removed too.

= Which WordPress version do I need? =

6.0 or later; the store app needs 6.6.

== External services ==

**Until you connect a RankX AI account, the plugin contacts no external service.**

RankX AI: https://rankxai.com · Terms: https://rankxai.com/terms-of-service · Privacy: https://rankxai.com/privacy-policy

= RankX AI (app.rankxai.com), only after you connect =

* **Connect** opens `https://app.rankxai.com/connect/wordpress` with this site's address, its wp-admin address, your user ID and a one-time code. When you approve, the browser returns to RankX AI with the site's address, the "RankX AI" user's login and its new Application Password, as WordPress's own Application Password screen does.
* **The Store page, and a product's RankX AI panel when you open it,** ask `https://app.rankxai.com/api/store-app/wp/session` for a ten-minute session (site and wp-admin addresses, the administrator's user ID and name, the site's token). The store app, or the panel for that one product, then calls `https://app.rankxai.com/api/store-app` from the browser, and sends an error's message, stack trace and page address to `https://app.rankxai.com/api/store-app/client-error`, at most three a page.
* **Images** come from `https://assets.rankxai.com` and, in AI shopping results, from the third-party stores those answers link to, on the Store page only.
* **Product changes.** When a product is created, updated, trashed, restored or deleted, the plugin sends its ID, what happened and your site's address to `https://app.rankxai.com/api/store-app/wp/product-events` a minute later.
* **Disconnect**, or deactivating the plugin while connected, tells `https://app.rankxai.com/api/store-app/wp/connection`.
* **What RankX AI saves on this site**, as approved in your account: search titles, descriptions, link previews, noindex, structured data, llms.txt and agents.md (served only if you switch them on, never in place of your own text) and a business summary for the copies, plus the Overview summary. It is all data; nothing is run as code. ai.txt is written only by you.
* **What RankX AI reads:** your posts, pages, products and terms; WooCommerce's settings and system status (which include the server environment and the active plugins); and the crawler counts, site checks and redirects this plugin shows. Orders, refunds, customers, the user list, product reviews and full comments only if you allow it in RankX AI › Settings.

= rankxai.com, only if you click it =

The Overview's "Run the free check" link opens `https://rankxai.com/tools/ai-visibility-checker` with this site's address.

<!-- github-build -->
= GitHub, only in the copy downloaded from GitHub or from RankX AI =

That copy checks `https://github.com/rankxai/rankxai-wp-plugin/releases/latest/download/rankxai-update.json` for a newer version at most every six hours. The request carries nothing about your site; GitHub sees your server's IP address. GitHub's terms: https://docs.github.com/site-policy/github-terms/github-terms-of-service · privacy: https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement
<!-- /github-build -->

= Your own site =

Site checks and View as AI fetch your own pages (user agent `RankXAI-SiteCheck`). The plugin sends no analytics, sets no cookies and collects nothing about your visitors.

== Screenshots ==

1. The product check and every product with something missing.
2. The Overview on a store.
3. The store app: shopper questions and the products AI answers show.
4. A product's page: what to fix, and how often AI answers named it.
5. Settings: markdown copies, llms.txt and agents.md.
6. AI crawlers: robots.txt per assistant, and crawler visits.

== Credits ==

* Geist typeface by Vercel and basement.studio, SIL Open Font License 1.1 (`assets/fonts/Geist-OFL.txt`).
* The image studio's three sample photos were generated for RankX AI with an AI image model, show no real product, brand or person, and are released under GPLv2 or later.
* The store app's build includes Vite's module-preload helper, MIT License (https://github.com/vitejs/vite).
* The RankX AI name and logo are RankX AI's trademarks.

== Changelog ==

= 0.1.0 =
* First release.
