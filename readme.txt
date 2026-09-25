=== RankX AI ===
Tags: seo, llms.txt, markdown, ai, seo metadata
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.4.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Publish llms.txt, agents.md and markdown copies of your pages for AI assistants, and write SEO metadata through any SEO plugin, or none.

== Description ==

Assistants like ChatGPT, Claude, Gemini and Perplexity read websites. They read
markup written for a browser, wrapped in a theme, and they have no agreed place
to look for a plain description of what a business does. This plugin gives them
one.

Two halves, and the first needs no account anywhere.

= Works on its own, with no account =

* **Publish an llms.txt and an agents.md.** Built from this site — its name, its
  tagline, its published pages and posts — and served from the site's own root
  address. Nothing is written to your server: WordPress answers when the address
  is requested. Off until you switch it on, under Settings → RankX AI.
* **Publish a markdown copy of every page.** Each copy is generated from the page
  itself, so it changes when the page does. Assistants read your words instead of
  your theme's markup. Also off by default.
* A page you have marked `noindex` is never listed and never gets a copy.
* **Count which AI crawlers visit.** GPTBot, ClaudeBot, PerplexityBot and others,
  per address and per day, with the status each was given. Off until you switch
  it on. It keeps the crawler's name, the address, the status and a count — no IP
  address, no browser details, nothing about human visitors — for 35 days.
* If another plugin already serves one of these addresses, it keeps it.

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
  redirects are listed under Settings → RankX AI, where you can remove any of
  them. The plugin never switches another plugin's modules on or off, and keeps
  no log of visitors.
* **Checks each crawler visit against its operator's published addresses.**
  RankX AI sends this site the address ranges that OpenAI, Anthropic, Perplexity,
  Google, Microsoft, Apple and Common Crawl publish for their crawlers, and reads
  the counts back to set them beside which assistants cite your pages.
* **Tells RankX AI what this site actually stored.** When RankX AI updates a
  page, the plugin returns the saved content in the same request, so a change
  that WordPress altered on the way in is reported to you rather than assumed to
  have worked.

Nothing is locked, reduced or switched off when there is no account. The account
adds more to say, not permission to say it.

= Markdown copies, in detail =

* Off until you turn it on, from Settings → RankX AI or from your RankX AI
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
2. Visit **Settings → RankX AI** to switch on markdown copies and root documents.
   Nothing is published until you do.
3. Optionally, connect the site from your RankX AI account.

== Frequently Asked Questions ==

= Do I need a RankX AI account? =

No. Markdown copies, `llms.txt` and `agents.md` are generated from this site and
work with no account and no connection. An account adds SEO metadata writing,
structured data, and your own approved description of the business in place of a
generated one.

= Does this send my content anywhere? =

No. The only request the plugin makes on its own is a check for a newer
version of itself, and only in the copy downloaded from GitHub or from your
RankX AI account — see *External services*.

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

**The copy from WordPress.org contacts no external service.**

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

It registers REST endpoints that your RankX AI account calls *inbound*, over your
site's own REST API, authenticated with a WordPress application password you
create and can revoke at any time. Apart from the update check above, the plugin
initiates no outbound request, sends no analytics, sets no cookies, and transmits no visitor data.

When the site is connected, RankX AI can read and write the SEO title,
description, canonical URL, and Open Graph and Twitter titles and descriptions
for posts and pages on this site; update the content, title, excerpt and slug of
a post or page you have approved a change to; store the JSON-LD structured data
shown in that page's head; store the contents of `llms.txt`, `agents.md`
and `ai.txt`; switch markdown copies on or off and store the short business
summary that appears on them; and read a summary of the site's configuration
(WordPress and PHP version, whether it is a multisite, and which SEO plugin is
active). It reads and writes nothing else.

Every one of those requires a WordPress account with permission to do it
already: a content update is refused unless the connected account may edit that
exact post, and the plugin applies WordPress's own content filters to every
write, exactly as the editor does.

* RankX AI: https://rankxai.com
* Terms: https://rankxai.com/terms
* Privacy: https://rankxai.com/privacy

== Changelog ==

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
