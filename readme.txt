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

Shoppers now ask ChatGPT, Gemini and Google's AI Mode what to buy. The answers list products, and they pick the ones whose details they can read: a barcode, a brand, a clear description, a price. RankX AI shows a WooCommerce store what those answers need from its products, and helps fix what keeps them out.

= Free, with no account =

* **Product check.** Checks your products for what AI shopping answers use: barcode (GTIN, UPC, EAN or ISBN), brand, main image and its alt text, a real description, a category and a price. It checks every published product, lists each one with something missing and says where to fix it. It runs on your site; nothing is sent anywhere.
* **Markdown copies of products and pages.** A plain-text copy of each page at its own address (`/product/blue-mug.md`), so an AI crawler reads your words, not your theme. Product copies start with price, availability, SKU, barcode, brand and categories. Copies carry `noindex`. Off until you switch them on.
* **llms.txt and agents.md**, generated from your site and served from its root address. Nothing is written to your server, and a real file or another plugin's llms.txt always wins. Off until you switch them on.
* **AI crawler visits.** Counts which AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) read which pages, per day. Off until you switch it on. No IP address or browser details are stored, and counts are deleted after 35 days.
* **robots.txt, per AI assistant.** Whether each assistant may read your site, the line that decides it, and the change to make. Two Site Health tests report the same.
* **Site checks.** Broken internal links, pages nothing links to, and images with no alt text, checked in the background. It changes nothing.
* **View as AI**, under any post, page or product: the copy an assistant is given, and whether the words you wrote are in the HTML your server sends.
* **Missing SEO tags.** With no SEO plugin, tick them in Settings: a meta description from your excerpt, Open Graph and Twitter tags, WordPress's sitemap, breadcrumbs.

Pages marked `noindex` (cart, checkout, account) and a store in WooCommerce's "Coming soon" mode get no copy and are left out of llms.txt.

= With a RankX AI account =

[RankX AI](https://rankxai.com) is a paid service with a 7-day free trial ([pricing](https://rankxai.com/pricing)). Connect from RankX AI › Store and the Store page runs RankX AI's store app in your dashboard:

* Which of your products ChatGPT, Google's AI Mode and other assistants show for the questions shoppers ask, and which stores they show instead.
* Product details fixed one at a time or in bulk, each shown before it is changed, with Undo afterwards.
* Product images, search titles and descriptions, and blog articles written for your store. Nothing is published until you approve it.
* Search titles, descriptions and structured data written through your SEO plugin, and which missing tags it would tick in Settings.
* Redirects added in the Redirection plugin or Rank Math, or kept by this plugin for addresses that would otherwise show "not found".

Anything that uses credits shows its price before you confirm. The plugin never prints a second title or description: it writes into your SEO plugin's own fields.

= Source code and build =

The store app ships compiled, in `admin-app/build`. Its source and build tools are public: https://github.com/rankxai/rankxai-wp-plugin, folder `admin-app/src`. To build it, run `npm install && npm run build` in that folder; it writes `dist/wordpress`, which is `admin-app/build`.

== Installation ==

1. Install from Plugins › Add New and activate it.
2. Open **RankX AI** in the admin menu. The Overview's "Start here" card has the first three steps.
3. On a store, open **RankX AI › Store** for the product check.
4. Optional: click **Connect RankX AI** to connect an account.

== Frequently Asked Questions ==

= Do I need a RankX AI account? =

No. Everything under "Free, with no account" works without one.

= Does the plugin send my data anywhere? =

Not until you connect a RankX AI account. Before that it only asks your own site for pages, and the Overview's "Run the free check" link opens rankxai.com only if you click it. See External services.

= What does connecting give RankX AI access to? =

You approve it on a RankX AI screen in wp-admin. That creates a user called "RankX AI" with its own role, and RankX AI signs in as that user with an Application Password only it holds, never as you.

The role can create and edit posts, pages, media and products and their categories and tags, move them to the trash, add and remove redirects, and read WooCommerce's settings and system status. It cannot install or change plugins or themes, manage users, change site settings, or sign in to wp-admin. Content it creates is credited to you.

The plugin also limits the password to the REST API (XML-RPC refuses it) and to an allow list: public post types and taxonomies, this plugin's own routes, plain redirects, and webhooks for product changes sent to RankX AI. It cannot post unfiltered HTML, issue refunds, read or create Application Passwords, or permanently delete content. Orders, refunds, customers, the user list, product reviews and full comment details stay off until you tick "Let RankX AI read orders, customers, users and comments" in RankX AI › Settings. Every change is recorded in your RankX AI account, and product fixes can be undone.

To stop it, click **Disconnect** in RankX AI › Settings or deactivate the plugin: both remove the RankX AI user, its Application Password and RankX AI's webhooks.

= What happens if I uninstall it? =

The connection, the RankX AI user, its Application Password and its webhooks are always removed. Unless you tick "Keep RankX AI's settings and data" in RankX AI › Settings, its settings, counts, check results and cached copies are removed too. Values it wrote into your SEO plugin stay there.

= Which WordPress version do I need? =

6.0 or later. The store app on the Store page needs 6.6 or later; on older versions everything else keeps working.

== External services ==

**Until you connect a RankX AI account, the plugin contacts no external service.**

= RankX AI (app.rankxai.com), only after you connect =

* **Connect.** Clicking **Connect RankX AI** opens `https://app.rankxai.com/connect/wordpress` in a new tab, with this site's address, its wp-admin address, your WordPress user ID and a one-time code in the link. You sign in or create an account there and approve.
* **The Store page.** When an administrator opens RankX AI › Store or a product's RankX AI panel, the plugin asks `https://app.rankxai.com/api/store-app/wp/session` for a ten-minute session, sending the site and wp-admin addresses, the administrator's user ID and display name, and the site's RankX AI token. The store app (included in the plugin) then calls `https://app.rankxai.com/api/store-app` from the browser as each screen needs: products, AI shopping results, the changes you approve, images and articles. If the store app hits an error, it sends the message, where in its code it happened and the page address to `https://app.rankxai.com/api/store-app/client-error`, at most three a page.
* **Images.** The store app shows images from `https://assets.rankxai.com` (images made for you) and, in AI shopping results, product images from the stores and image hosts those answers link to.
* **Product changes.** On a store, RankX AI adds WooCommerce webhooks so that WooCommerce sends a product's details to `https://app.rankxai.com` when it is created, updated, deleted or restored. They are removed when you disconnect.
* **Disconnect.** Disconnecting or deactivating tells `https://app.rankxai.com/api/store-app/wp/connection`, then removes the token, the RankX AI user, its Application Password and the webhooks.
* **What RankX AI stores on this site.** Through this plugin's routes, RankX AI saves the changes you approve (search titles and descriptions, structured data, redirects, llms.txt, agents.md and ai.txt, a short block of business facts for the markdown copies), the Overview's AI visibility summary, and the AI crawlers' published address ranges for the crawler counts. It is all data; nothing is run as code.

= rankxai.com, only if you click it =

The Overview's "Run the free check" link opens `https://rankxai.com/tools/ai-visibility-checker` in a new tab with this site's address in the link. Nothing is sent unless you click it.

RankX AI: https://rankxai.com · Terms: https://rankxai.com/terms-of-service · Privacy: https://rankxai.com/privacy-policy

<!-- github-build -->
= GitHub, only in the copy downloaded from GitHub or from RankX AI =

That copy checks `https://github.com/rankxai/rankxai-wp-plugin/releases/latest/download/rankxai-update.json` for a newer version at most every six hours. The request carries nothing about your site; GitHub sees your server's IP address. GitHub's terms: https://docs.github.com/site-policy/github-terms/github-terms-of-service · privacy: https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement
<!-- /github-build -->

= Your own site =

Site checks and View as AI ask your own site for its pages, with the user agent `RankXAI-SiteCheck`. Those requests go nowhere else.

The plugin sends no analytics, sets no cookies and collects nothing about your visitors.

== Screenshots ==

1. The product check and every product with something missing.
2. The Overview on a store.
3. The store app: shopper questions and the products AI answers show.
4. A product's page: what to fix, and how often AI answers named it.
5. Settings: markdown copies, llms.txt and agents.md.
6. AI crawlers: robots.txt per assistant, and crawler visits.

== Credits ==

* The admin pages use the Geist typeface by Vercel and basement.studio, under the SIL Open Font License 1.1 (`assets/fonts/Geist-OFL.txt`), served from your site.
* The RankX AI name and logo identify the plugin and are RankX AI's trademarks.

== Changelog ==

= 0.1.0 =
* First release.
