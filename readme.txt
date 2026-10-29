=== RankX AI – AI Shopping & SEO for WooCommerce ===
Contributors: rankxai
Tags: woocommerce, ai shopping, seo, llms.txt, ai search
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.5.6
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

See how ChatGPT and Google show your WooCommerce products and fix what keeps them out. Publish llms.txt and markdown copies for AI.

== Description ==

= On a WooCommerce store, with a RankX AI account =

Connect RankX AI from the plugin's Settings page and **RankX AI › Store** runs
RankX AI's store app inside your dashboard:

* **AI search.** The questions shoppers ask ChatGPT and Google's AI Mode, which
  of your products the answers show, and which stores they show instead.
* **Products.** Every product checked for the details AI shopping answers need
  (identifiers, categories, images, descriptions), fixed one at a time or in
  bulk, each change with Undo and a "did it work?" check.
* **Image studio, SEO and Blog.** Product photos, search titles and
  descriptions, and articles written for your store.
* **On WooCommerce's own screens**, a link under each product and a panel on
  its edit screen show its open gaps and how often AI answers show it.

Plans and credits are RankX AI's (a free trial, then a monthly plan); the plugin
itself is free and complete, and anything that costs credits shows its price
first. RankX AI's terms and privacy policy are linked under *External services*.

Assistants like ChatGPT, Claude, Gemini and Perplexity read websites. They read
markup written for a browser, wrapped in a theme, and they have no agreed place
to look for a plain description of what a business does. This plugin gives them
one.

It is a companion, not an SEO plugin. It works alongside Yoast SEO, Rank Math,
All in One SEO, SEOPress, The SEO Framework and the rest, writes into their own
fields when a RankX AI account asks it to, and never prints a second copy of
anything they already print.

Two halves, and the first needs no account anywhere. Everything lives under its
own **RankX AI** menu in wp-admin.

= Works on its own, with no account =

* **Publish an llms.txt and an agents.md.** Built from this site — its name, its
  tagline, its published pages and posts — and served from the site's own root
  address. Nothing is written to your server: WordPress answers when the address
  is requested. Off until you switch it on, under RankX AI → Settings.
* **Publish a markdown copy of every page.** Each copy is generated from the page
  itself, so it changes when the page does. Assistants read your words instead of
  your theme's markup. Also off by default.
* A page you have marked `noindex` is never listed and never gets a copy.
* **Count which AI crawlers visit.** GPTBot, ClaudeBot, PerplexityBot and others,
  per address and per day, with the status each was given. Off until you switch
  it on. It keeps the crawler's name, the address, the status and a count — no IP
  address, no browser details, nothing about human visitors — for 35 days.
* If another plugin already serves one of these addresses, it keeps it.
* **See whether AI crawlers can get in.** The AI crawlers page reads your
  robots.txt the way each crawler does and says, per assistant, whether it may
  read the site and which line decided it, with the exact change to make if you
  want a different answer. Two Site Health tests report the same.
* **Find broken internal links, pages nothing links to, and images with no
  text description.** Site checks reads your pages in the background, in small
  batches, the way a visitor sees them. It checks links within your own site
  only, never other people's. "Add redirect" fixes a broken address after
  checking it is really missing.
* **View as AI.** Under any post or page, see the Markdown an assistant is
  given, whether the page is marked noindex, whether robots.txt lets each
  assistant read it, and whether the words you wrote are in the HTML the server
  sends (words added by JavaScript are missed by many AI crawlers).

= Works better with a RankX AI account =

[RankX AI](https://rankxai.com) is an AI-search and SEO platform. It is a paid
service, and this plugin is the site-side half of it. Connected, the plugin also:

* **Writes SEO metadata through every major SEO plugin.** Yoast, Rank Math,
  SEOPress, All in One SEO, The SEO Framework, SiteSEO and SureRank. Values are written into that
  plugin's own fields, so they stay visible and editable in the screens you
  already use.
* **Writes SEO metadata with no SEO plugin at all.** If you do not run one,
  RankX AI prints the title, description, Open Graph and Twitter tags itself.
  Install an SEO plugin later and it stands down automatically, on the next page
  load, so you never end up with two titles on one page.
* **Reaches All in One SEO.** AIOSEO keeps its data in its own database tables
  rather than in post meta, so no external tool can reach it. This plugin can.
* **Puts structured data in the page head, not in the page.** Search engines and
  assistants read JSON-LD to understand what a business does. Without the plugin
  it has to be written into the page content, where WordPress removes it unless
  the account writing it holds a capability many sites take away. Stored here it
  is emitted from the document head instead, so it is never stripped and your
  page content is left exactly as you wrote it.
* **Fills llms.txt with your own words.** With an account the file carries the
  description of the business you approved — what you sell, who it is for, what
  it costs — rather than a list of page titles. A published file always takes
  precedence over a generated one.
* **Adds a short business summary to every markdown copy.**
* **Manages redirects in the tool you already use.** If you run the Redirection
  plugin or Rank Math's Redirections module, RankX AI adds redirects there, so
  they appear in that plugin's list with its hit counts. If you run neither, this
  plugin keeps a short list itself and answers only for addresses that would
  otherwise show "page not found", so it can never hide a page that works. Those
  redirects are listed under RankX AI → Settings, where you can remove any of
  them. The plugin never switches another plugin's modules on or off, and keeps
  no log of visitors.
* **Checks each crawler visit against its operator's published addresses.**
  RankX AI sends this site the address ranges that OpenAI, Anthropic, Perplexity,
  Google, Microsoft, Apple and Common Crawl publish for their crawlers, and reads
  the counts back to set them beside which assistants cite your pages.
* **Turns site checks into tasks.** Broken links, pages nothing links to and
  images with no alt attribute become tasks in RankX AI, and close themselves when
  the next check no longer finds them.
* **Shows your AI visibility on the Overview.** How often each assistant named
  the business in the last 30 days, pages AI crawlers read but never cite, and
  your open tasks, dated, and labelled when out of date.
* **Tells RankX AI what this site actually stored.** When RankX AI updates a
  page, the plugin returns the saved content in the same request, so a change
  that WordPress altered on the way in is reported to you rather than assumed to
  have worked.

Nothing is locked, reduced or switched off when there is no account. The account
adds more to say, not permission to say it.

= Markdown copies, in detail =

* Off until you turn it on, from RankX AI → Settings or from your RankX AI
  account. Activating or updating the plugin never publishes a new URL on its own.
* Each copy answers at `/page.md`, `/page/index.md` and `/page/?format=md`, and at
  the page's normal address for a client that asks for `text/markdown`.
* Copies are served `noindex, follow` and carry a link back to the HTML page, so
  they are read by assistants and stay out of search results. There is
  deliberately no canonical tag on them.
* A page you have marked `noindex` in your SEO plugin gets no copy at all.
* A list of every copy is available at `/sitemap-md.xml`. It is deliberately not
  announced in `robots.txt`, because declaring `noindex` URLs to a search engine
  earns a warning per page.
* Developers: `rankxai_twins_enabled` forces the whole feature on or off in
  code, `rankxai_twin_eligible` vetoes one post, `rankxai_twin_cache_ttl` sets
  how long a rendered copy is cached, and `rankxai_twins_bypass_page_cache`
  controls whether markdown responses skip your page cache.

= Root documents, in detail =

* `llms.txt` and `agents.md` can be generated here from the site's own content.
  `ai.txt` cannot, and that is deliberate: it states a position on whether your
  work may be used to train machine-learning models, which is yours to take and
  not ours to guess. It can still be published from a RankX AI account.
* The order is always the same: a real file on your server wins, then a document
  published from a RankX AI account, then a generated one. If none of those
  applies the address is left alone, so anything else that would have served it
  still does.
* Developers: `rankxai_generate_document` forces generation on or off per
  document, and `rankxai_generated_document_post_types` chooses what is listed.

= It is optional =

RankX AI works without this plugin, over the standard WordPress REST API and an
application password. The plugin removes that setup step and adds the
capabilities above. Nothing in RankX AI requires it, and removing it never costs
you your metadata — see below.

== Installation ==

1. Install and activate.
2. Open **RankX AI** in the admin menu. Its Settings page switches on markdown
   copies and root documents; nothing is published until you do. (Before 0.5.0
   the same page was under Settings → RankX AI; that address still works.)
3. Optionally, connect the site from your RankX AI account.

== Frequently Asked Questions ==

= Do I need a RankX AI account? =

No. Markdown copies, `llms.txt` and `agents.md` are generated from this site and
work with no account and no connection. An account adds SEO metadata writing,
structured data, and your own approved description of the business in place of a
generated one.

= Does this send my content anywhere? =

Not until you connect a RankX AI account. Before that, the only request the
plugin makes to another server is a check for a newer version of itself, and
only in the copy downloaded from GitHub or from your RankX AI account. Once you
click **Connect RankX AI** and approve it, the plugin also asks RankX AI for a
session when an administrator opens the Store page — see *External services*.

To check links, robots.txt and "View as AI", it asks **your own site** for a
page, the way a visitor would. Those requests go to this site's own address and
nowhere else, carry the user agent `RankXAI-SiteCheck`, and add a
`rankxai_check` parameter so a page cache answers with the current page. A
request that may answer "not found" is made from WordPress's scheduled tasks, a
few at a time, never in a burst.

= How do I get updates? =

The copy from WordPress.org updates like any other plugin. The copy downloaded
from GitHub or from your RankX AI account shows updates on your Plugins screen
too, and can be set to update automatically there, because it checks GitHub for
new releases. Updating from 0.3.0 or earlier is one manual step, since those
versions cannot check.

= What does crawler counting store? =

When you switch it on, each visit from a known AI crawler adds one to a counter
for that day, crawler, address and response status. The visitor's IP address is
used only to check it against the ranges the crawler's operator publishes, and
is never stored. Browser details and query strings are never stored, and ordinary
visitors are not counted at all. Counts older than 35 days are deleted, and
uninstalling removes the table. Visits a page cache answers without running
WordPress are not seen, so on a cached site the counts are lower than the real
numbers.

= What happens if I uninstall it? =

Only the plugin's own stored values are removed. Anything it wrote into Yoast,
Rank Math, SEOPress, The SEO Framework or All in One SEO is left exactly where it
is, because once written it is that plugin's data and appears in its own screens.
Uninstalling RankX AI should cost you RankX AI, not your SEO metadata.

= I use a page builder / an SEO plugin you do not list. =

Nothing breaks. If another plugin is handling your document head and this plugin
cannot identify it, RankX AI stores its metadata and prints nothing, rather than
adding a second title to the page. Developers can use the
`rankxai_active_seo_plugins` filter to declare a plugin this list does not know,
or `rankxai_may_own_head` to stop RankX AI printing tags entirely.

= Another plugin already publishes an llms.txt. =

It keeps it. This plugin registers its route late and stands down for any
address that is already answered, and for any real file on your server.

== External services ==

**Until you connect a RankX AI account, the copy from WordPress.org contacts no external service.**

= RankX AI (app.rankxai.com), only after you connect =

Connecting is your choice: an administrator clicks **Connect RankX AI** in
RankX AI › Settings (or on the Store page), signs in to RankX AI in a new tab,
chooses which of their websites this is, and approves it. Nothing below happens
before that, and disconnecting or deactivating the plugin stops it.

Once connected, the plugin calls one address, `https://app.rankxai.com`:

* When an administrator opens RankX AI › Store (or a product's RankX AI panel),
  it asks `https://app.rankxai.com/api/store-app/wp/session` for a ten-minute
  session. It sends this site's address, its wp-admin address, the
  administrator's WordPress user id and display name, and the site token RankX AI
  gave this site when you connected. The site token stays on your server.
* The Store page then runs RankX AI's store app, which is included in this
  plugin (`admin-app/build`, with its readable source in `admin-app/src`), and
  which talks to `https://app.rankxai.com/api/store-app` from the administrator's
  browser with that session: product details, AI shopping results, fixes you
  approve, images and articles, as each screen needs them.
* When you disconnect, or deactivate the plugin, it tells
  `https://app.rankxai.com/api/store-app/wp/connection`, then removes the
  site token and the Application Passwords RankX AI's approval created.

A server that blocks outgoing requests (`WP_HTTP_BLOCK_EXTERNAL`) is told so on
the Settings page, and nothing is sent.

= GitHub, in the copy downloaded from GitHub or from RankX AI =

The copy downloaded from GitHub or from your RankX AI account also checks
github.com for a newer release, so WordPress can show you an update. It asks
for one small file,
`https://github.com/rankxai/rankxai-wp-plugin/releases/latest/download/rankxai-update.json`,
at most every six hours, when WordPress checks for updates. The request carries
no information about your site or its visitors, though GitHub sees your
server's IP address, as it would for any download. When you update, WordPress
downloads the new version from the same repository. GitHub's terms:
https://docs.github.com/site-policy/github-terms/github-terms-of-service and
privacy statement:
https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement

= What RankX AI can do on this site =

It registers REST endpoints that your RankX AI account calls *inbound*, over your
site's own REST API, authenticated with a WordPress application password you
approve and can revoke at any time. Apart from the calls above, the plugin
makes no request to any other server (it asks only its own site for pages, to
check links and robots.txt), sends no analytics, sets no cookies, and transmits no visitor data.

When the site is connected, RankX AI can read and write the SEO title,
description, canonical URL, and Open Graph and Twitter titles and descriptions
for posts and pages on this site; update the content, title, excerpt and slug of
a post or page you have approved a change to; store the JSON-LD structured data
shown in that page's head; store the contents of `llms.txt`, `agents.md`
and `ai.txt`; switch markdown copies on or off and store the short business
summary that appears on them; and read a summary of the site's configuration
(WordPress and PHP version, whether it is a multisite, and which SEO plugin is
active); read the findings of the last site check (link paths, page titles and
counts); and store the summary shown on the Overview. It reads and writes
nothing else.

Every one of those requires a WordPress account with permission to do it
already: a content update is refused unless the connected account may edit that
exact post, and the plugin applies WordPress's own content filters to every
write, exactly as the editor does.

The Overview offers a link to RankX AI's free AI Visibility Checker at
https://rankxai.com/tools/ai-visibility-checker. The plugin makes no request for
it: clicking the link opens that page in your browser with this site's address
filled in, and nothing runs until you enter an email address and start the check.

* RankX AI: https://rankxai.com
* Terms: https://rankxai.com/terms-of-service
* Privacy: https://rankxai.com/privacy-policy

== Screenshots ==

1. The Overview: what AI assistants can see on this site, and the next step for each feature.
2. AI crawlers: which AI crawlers read the site, and whether robots.txt lets them in.
3. Site checks: broken and redirected internal links, pages nothing links to, and images with no text description.
4. Settings: markdown copies, root documents and redirects, all local.
5. Store: the store app in wp-admin, with the products AI shopping answers show and the gaps that keep the rest out.
6. Store › Products: one product's gaps, fixed with Undo.

== Credits ==

* The admin pages use the Geist typeface by Vercel and basement.studio, bundled
  with the plugin under the SIL Open Font License 1.1
  (https://github.com/vercel/geist-font, licence in `assets/fonts/Geist-OFL.txt`).
  It is served from your own site, never from a font service.
* The RankX AI logo is the trademark of RankX AI and is included only to identify
  the plugin.

== Changelog ==

= 0.5.6 =
* The header says "Connected to RankX AI" only once this plugin is connected. A site RankX AI reaches without it now reads "Receiving updates from RankX AI", so it no longer shows connected above the Connect button.

= 0.5.5 =
* Connect RankX AI from WordPress: a button in RankX AI › Settings opens RankX AI, where you sign in or create an account, choose this site, and approve it. Disconnect from the same card.
* On a WooCommerce store, RankX AI › Store runs RankX AI's store app in your dashboard: AI shopping results, product fixes with Undo, images, SEO and blog articles. It is included in the plugin, with its source, and loads only once you connect.
* Declares compatibility with WooCommerce's order tables and cart and checkout blocks.

= 0.5.4 =
* Product categories (and tags) get a search title and description from RankX AI, through your SEO plugin: Yoast, Rank Math, SEOPress, The SEO Framework, SiteSEO or SureRank keep them in their own settings, and with no SEO plugin RankX AI prints them on the category page itself.
* "Keep search engines out" can be switched on or off for a product or page from RankX AI. It goes into your SEO plugin's own robots setting, so what search engines are shown is what that plugin prints.

= 0.5.3 =
* Overview: "Run the free check" opens RankX AI's free AI Visibility Checker with this site's address filled in. It asks ChatGPT and Gemini three questions a customer would ask and shows whether this site is named, and who is named instead.
* Site checks: when no page is missing links and some have only one, the card's heading says so, instead of "Pages nothing links to".

= 0.5.2 =
* Site checks ask Rank Math which content types its sitemap lists, so a type another plugin keeps out of that sitemap is not read as pages, even with Rank Math's own setting left on.
* A broken or redirected link in a menu, or in the header or footer every page carries, now says so in "Linked from", with a link to where it is changed and advice to match. Before, the row was blank and said to edit a page.

= 0.5.1 =
* Site checks read only the content types your sitemap lists. With Rank Math, that is the types its sitemap includes, so theme content blocks and form entries are no longer listed as pages.
* Site checks count links in your home page's header, footer and menus, so a footer or mega menu built from reusable blocks counts.
* Page titles sent to RankX AI are plain text.

= 0.5.0 =
* Its own RankX AI menu, with Overview, AI crawlers, Site checks and Settings pages. The old Settings → RankX AI address redirects.
* AI crawlers: visits grouped by what each crawler is for, the errors they hit with "Add redirect" beside each, and a robots.txt check per assistant with the fix.
* Site checks: broken and redirected internal links, pages nothing links to, and images with no alt attribute, read in the background.
* View as AI under every post and page.
* Site Health tests for robots.txt and for errors AI crawlers keep hitting.
* With an account: site checks become tasks, and the Overview shows your AI visibility.

= 0.4.4 =
* A "Check for updates" link on the Plugins screen asks GitHub straight away instead of waiting for WordPress's next scheduled check.

= 0.4.3 =
* The RankX AI icon now shows beside the plugin on the Dashboard → Updates screen.

= 0.4.2 =
* Fix: WordPress 7.1.2 and other patch releases no longer show "not tested with your version of WordPress" for this plugin.

= 0.4.1 =
* Structured data managed per schema through your SEO plugin: Rank Math's own schema rows where Rank Math supports the type, otherwise added to your SEO plugin's graph so each page prints one graph. Works with Rank Math, Yoast SEO, All in One SEO, SEOPress, The SEO Framework, Slim SEO, SiteSEO and SureRank, or with no SEO plugin.
* SEO metadata through SiteSEO and SureRank.
* Gap filling on sites with no SEO plugin: meta description, Open Graph, Twitter card, the core XML sitemap and breadcrumbs, each switched on only where nothing else prints it, and never while an SEO plugin is active.
* Fix: an SEO title or description containing a backslash lost it when written into Yoast, Rank Math, SEOPress, The SEO Framework, SiteSEO or the plugin's own fields.
* Schema published from RankX AI's AI-readiness check now joins your SEO plugin's graph instead of printing a second one.

= 0.4.0 =
* Update notices: copies installed from GitHub or from a RankX AI download now show new versions on the Plugins screen and can update automatically.

= 0.3.0 =
* Optional AI crawler visit counts: which AI crawlers fetch which addresses, per day. Off by default. No IP addresses or browser details are stored.

= 0.2.1 =
* Fixed: a redirect for an address with accented or other non-ASCII characters never answered.

= 0.2.0 =
* Redirects: added to Rank Math or kept by this plugin when a site has no redirect manager, only ever answering a missing page.
* Page caches are cleared for an address when a redirect for it is added or removed.
* Settings → RankX AI lists this plugin's own redirects, each removable.

= 0.1.0 =
* Markdown copies, `llms.txt` and `agents.md` now work with no RankX AI account.
* New settings screen at Settings → RankX AI.
* `llms.txt` and `agents.md` can be generated from the site's own content.
* Nothing is generated while Settings → Reading is set to discourage search engines.

= 0.0.1 =
* First release.
