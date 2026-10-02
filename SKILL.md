---
name: sf-docs-fetch
description: Fetches developer.salesforce.com / salesforce.com pages when Claude Code's built-in WebFetch tool returns a 403 Forbidden or otherwise fails to retrieve content. Salesforce's developer docs site (especially the ISVforce Guide under developer.salesforce.com/docs/platform/isvforce/) blocks WebFetch's plain HTTP request with bot detection, even though the same URL loads fine in a real browser. Use this skill immediately whenever WebFetch fails on any salesforce.com or developer.salesforce.com URL - don't give up on the page or ask the user to paste its content manually until this fallback has been tried.
---

# SF Docs Fetch

## Why this exists

Some Salesforce documentation pages don't load when fetched directly - the request comes back blocked, even though the exact same page opens completely normally in a real browser. This skill works around that two ways: first by trying Salesforce's own official docs search service directly, and if that doesn't have the page, by opening the page in an actual (invisible) browser instead, the same way a person would, so the real content can still be read.

**More technically:** Salesforce's developer docs site (particularly the ISVforce Guide under `developer.salesforce.com/docs/platform/isvforce/`) is a JavaScript-rendered app - the guide content loads via client-side JS after the page boots, not in the initial HTML response. Claude Code's `WebFetch` tool doesn't execute JavaScript, so even where it isn't blocked outright, it would have nothing real to extract. In practice it's blocked more directly than that: `WebFetch` gets an explicit HTTP 403 Forbidden on these pages, consistent with bot/WAF detection (Akamai, Cloudflare, or Salesforce's own edge security) rejecting the plain HTTP request's fingerprint - no JS execution, and a TLS/HTTP2/header signature that doesn't look like a real browser - not just a rendering gap.

This failure mode is also unusually easy to miss: `WebFetch` passes whatever it does retrieve through a smaller model that summarizes it against the prompt, so a blocked or near-empty page can produce a vague or subtly wrong summary rather than an obvious error - it can look like it worked when it didn't. That's exactly why this skill's instructions below say to reach for this fallback immediately on failure, rather than trusting a suspiciously thin `WebFetch` result.

**The fix has two tiers.** Salesforce publishes an official Docs MCP (a semantic-search index over their own documentation, see `labs.agentforce.com/docs/salesforce-docs-mcp`) - it's a real, unauthenticated HTTP endpoint, so this skill calls it directly with a plain HTTP request, no `claude mcp add`/registration/restart needed. When the requested URL is in that index, this returns Salesforce's own current, officially-maintained content - faster and more authoritative than scraping, and confirmed (by directly diffing several pages against the live rendered page) to match word-for-word. When the MCP doesn't have a page indexed, this skill falls back to driving a real headless Chromium browser via Playwright, which executes the page's JavaScript and presents a realistic browser fingerprint - getting past `WebFetch`'s block the same way a real browser would.

`help.salesforce.com` URLs get one extra step first: they embed a release-version query param (e.g. `&release=264.0.0`) that the MCP's fetch-by-URL lookup matches exactly, so a URL missing that param (the common case for a pasted or `WebFetch`-constructed link) misses even though the article is genuinely indexed. Before falling back to Playwright on a `help.salesforce.com` URL, this skill searches for the article by its slug and only accepts a result whose document path is an exact match (never just the top search hit, since a bare-slug search isn't reliably top-ranked) - this alone resolves most of those otherwise-missed pages without ever touching the browser.

## When to use this

Whenever a `WebFetch` call on a `salesforce.com` or `developer.salesforce.com` URL fails - a 403, an empty body, or any other clear block - reach for this instead of giving up on the page or asking the user to paste its content by hand. Try `WebFetch` first since it's faster when it works; fall back to this only when it doesn't.

This is scoped to Salesforce domains specifically. It's not a general-purpose scraper - most sites don't need this, and reaching for a headless browser by default would be slower and heavier than necessary.

## How to use it

1. **Fetch the page directly - no setup first**:
   ```bash
   node fetch.js "<url>"
   ```
   Run this from inside the skill's own directory (`fetch.js` lives alongside this SKILL.md, wherever that ends up being installed). It tries the official Salesforce Docs MCP first, which needs nothing installed - for any page it has indexed, this just works immediately. Treat the stdout output the same way you'd treat a successful `WebFetch` result - read it, summarize it, or answer the user's question from it.

2. **Only if that fails with a "Cannot find module 'playwright'" error** (meaning the MCP didn't have this page indexed and it fell through to the browser fallback, which isn't installed yet): do the one-time Playwright setup, then retry the exact same command from step 1. First confirm Node is available:
   ```bash
   node --version
   ```
   This needs Node.js 18 or later already installed on the machine. If `node --version` fails (command not found) or reports a version below 18, stop here and tell the user - installing/upgrading Node itself is outside this skill's scope and depends on their OS/package manager.

   If Node is present, `cd` into this skill's directory and install dependencies:
   ```bash
   npm install && npx playwright install --with-deps chromium
   ```
   The `npx playwright install` step downloads the actual browser binary Playwright drives (~280MB) - `npm install` alone only installs the JS library, not the browser itself. `--with-deps` also installs the OS-level shared libraries Chromium needs to actually launch on Linux (without it, the download succeeds but the browser can fail to start with cryptic shared-library errors) - it's a no-op on macOS/Windows, so it's safe to always include. This cost is only ever paid the first time a page isn't MCP-indexed, not on every fetch.

   If this step fails: a corporate firewall may be blocking Playwright's CDN download domain specifically (even when general internet access works), or antivirus/endpoint security may quarantine the downloaded browser binary as an unsigned executable. Both are environment-specific network/security policy issues, not a bug in this skill - they need to be resolved with whoever manages that machine's network/security policy.

3. **If it still fails after setup**: the script exits non-zero and prints the reason to stderr (e.g. still getting a non-2xx status even via the headless browser). At that point, this specific page may need the user to paste its content manually - don't loop retrying the same URL.

## Notes

- `fetch.js` always tries the official Salesforce Docs MCP first (a plain HTTP call, no setup) and only launches a browser when that misses - so most fetches of indexed pages return in well under a second, not the few-seconds cost of a fresh headless browser.
- Either way, don't use this as the default first attempt everywhere - it's still slower than `WebFetch` when `WebFetch` actually works, so try that first and reach for this only as the Salesforce-domain fallback.
- The script prints which path served the content ("mcp" or "playwright") to stderr - useful for noticing if a page you expected to be indexed fell through to the browser. On an MCP hit, it also prints that collection's `last_indexed` timestamp (a separate MCP resource, not something the search/fetch tools report themselves) - purely informational, not used to decide whether to trust the result, since there's no clean staleness cutoff to pick.
- The Playwright branch reads `document.body.innerText`, which approximates what a human reader sees (rendered, not raw HTML) - closer to what `WebFetch` normally returns than a raw HTML dump would be.
