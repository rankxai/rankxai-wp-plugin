=== RankX AI ===
Tags: seo, llms.txt, markdown, ai, seo metadata
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Bring SEO metadata from your RankX AI account to this site, through whichever SEO plugin you use, or with none at all.

== Description ==

RankX AI is an AI-search and SEO platform. This plugin is the site-side half of
it: SEO metadata you approve in your RankX AI account is written to this site
and reaches the page.

The plugin generates nothing on its own. All generation, editing and approval
happen in your RankX AI account, which is a paid service. This plugin is free
and GPLv2 or later.

= What it does that the REST API cannot =

* **Works with every major SEO plugin.** Yoast, Rank Math, SEOPress, All in One
  SEO and The SEO Framework. Values are written into that plugin's own fields,
  so they stay visible and editable in the screens you already use.
* **Works with no SEO plugin at all.** If you do not run one, RankX AI prints the
  title, description, Open Graph and Twitter tags itself. Install an SEO plugin
  later and it stands down automatically, on the next page load, so you never end
  up with two titles on one page.
* **Writes All in One SEO.** AIOSEO keeps its data in its own database tables
  rather than in post meta, so no external tool can reach it. This plugin can.
* **Serves llms.txt, agents.md and ai.txt.** Published from your RankX AI
  account and served from this site's own root address, without a file being
  written anywhere. If another plugin already serves one of those addresses, it
  keeps it.
* **Publishes a markdown copy of every page.** Off by default. When you switch it
  on from your RankX AI account, each published page also answers at `/page.md`,
  `/page/index.md` and `/page/?format=md`, and at its normal address for a client
  that asks for `text/markdown`. AI assistants read your words instead of your
  theme's markup.
* **Puts structured data in the page head, not in the page.** Search engines and
  assistants read JSON-LD to understand what a business does. Without the plugin
  it has to be written into the page content, where WordPress removes it unless
  the account writing it holds a capability many sites take away. Stored here it
  is emitted from the document head instead, so it is never stripped and your
  page content is left exactly as you wrote it.
* **Tells RankX AI what this site actually stored.** When RankX AI updates a
  page, the plugin returns the saved content in the same request, so a change
  that WordPress altered on the way in is reported to you rather than assumed to
  have worked.

= Markdown copies, in detail =

* Off until you turn it on. Activating or updating the plugin never publishes a
  new URL on its own.
* Each copy is generated from the page itself, so it changes when the page does.
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
  controls whether markdown responses skip your page cache. Which post types get
  a copy is chosen in your RankX AI account.

= It is optional =

RankX AI works without it, over the standard WordPress REST API and an
application password. This plugin removes that setup step and adds the
capabilities above. Nothing in RankX AI requires it, and removing it never costs
you your metadata — see below.

== Installation ==

1. Install and activate.
2. Connect the site from your RankX AI account.

== Frequently Asked Questions ==

= Does this send my content anywhere? =

No. This version makes no outbound connections at all — see *External services*.

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

== External services ==

**This version of the plugin contacts no external service.**

It registers REST endpoints that your RankX AI account calls *inbound*, over your
site's own REST API, authenticated with a WordPress application password you
create and can revoke at any time. The plugin itself initiates no outbound
request, sends no analytics, sets no cookies, and transmits no visitor data.

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

= 0.0.1 =
* First release.

