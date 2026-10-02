# sf-docs-fetch
Claude Code isn't good at reading Salesforce documentation. Until now.

A [Claude Code](https://claude.com/claude-code) skill that fetches `developer.salesforce.com` pages when Claude Code's built-in `WebFetch` tool gets blocked.

## The problem

Some Salesforce documentation pages don't load when Claude Code tries to fetch them directly - the request comes back blocked, even though the exact same page opens completely normally in your own browser. This skill fixes that by having Claude Code open the page in an actual (invisible) browser instead, the same way you would, so it can read the real content.

<details>
<summary>More technical detail</summary>

Salesforce's developer docs site (particularly the ISVforce Guide under `developer.salesforce.com/docs/platform/isvforce/`) is a JavaScript-rendered app - the guide content loads via client-side JS after the page boots, not in the initial HTML response. Claude Code's `WebFetch` tool doesn't execute JavaScript, so even where it isn't blocked outright, it would have nothing real to extract.

In practice it's blocked more directly than that: `WebFetch` gets an explicit HTTP 403 Forbidden on these pages, consistent with bot/WAF detection rejecting the plain HTTP request's fingerprint (no JS execution, and a TLS/HTTP2/header signature that doesn't look like a real browser) - not just a rendering gap.

This failure mode is also unusually easy to miss: `WebFetch` passes whatever it does retrieve through a smaller model that summarizes it against your prompt, so a blocked or near-empty page can produce a vague or subtly wrong summary rather than an obvious error - it can look like it worked when it didn't.

</details>

## The fix

First, this calls Salesforce's own official [Docs MCP](https://labs.agentforce.com/docs/salesforce-docs-mcp) directly - a real, unauthenticated HTTP endpoint, so no `claude mcp add`/registration/restart needed. It's a semantic-search index over Salesforce's own documentation; when a requested page is indexed, this returns Salesforce's own current content straight from the source - confirmed (by diffing several pages against the live rendered page) to match word-for-word. It's genuinely useful on its own merits but easy to miss (buried in a labs site, and normally requires manual MCP registration + a Claude Code restart to use) - this skill just calls it directly, with no setup.

When a page isn't in that index, this falls back to driving a real headless Chromium browser via [Playwright](https://playwright.dev/) instead of a bare HTTP request. That presents a realistic browser fingerprint, which gets past the block. It's scoped to Salesforce domains specifically - it's a targeted fallback, not a general-purpose scraper.

`help.salesforce.com` links get one extra step before that fallback: their URLs embed a release-version query param the MCP's lookup matches exactly, so a pasted link missing that param misses even though the article is indexed. This skill searches for the article by slug first (accepting only an exact document-path match, not just the top hit) - closing most of that gap without ever opening a browser.

## Install

Clone this repo directly into your Claude Code skills folder:

```bash
git clone https://github.com/<your-username>/sf-docs-fetch-skill.git ~/.claude/skills/sf-docs-fetch
```

(Or clone anywhere and copy the folder in - the skill works from wherever it's actually installed under `~/.claude/skills/`.)

No setup beyond that - `fetch.js` tries the official Salesforce Docs MCP first, which needs nothing installed. Only if a specific page isn't in that index does Claude Code fall through to the Playwright path, and only then does it run the one-time setup itself (installing the `playwright` npm package and downloading a Chromium browser binary, per `SKILL.md`). You don't need to do this manually, and most fetches never trigger it at all - just have the repo in place.

**Requirements:** Node.js 18+.

## How it works

- `SKILL.md` - the instructions Claude Code reads to know when and how to use this skill.
- `fetch.js` - the actual fetch script. Takes a URL, first tries Salesforce's official Docs MCP by URL (a plain HTTP call); for a `help.salesforce.com` URL that misses, tries once more via a slug search before giving up on the MCP; if it still isn't indexed, falls back to launching headless Chromium, waiting for the page to render, and printing the visible text content (`document.body.innerText`). Prints which path served the content ("mcp" or "playwright") to stderr - on an MCP hit, also prints that collection's last-indexed date, purely as a diagnostic (not used to reject stale-looking results - there's no clean cutoff to pick).
- `test.js` - a regression test (`npm test`) that checks both paths against real Salesforce doc pages, plus one deliberately-bad URL to confirm failure handling works cleanly.

## Limitations

- **The MCP path only covers what Salesforce has chosen to index.** It's Salesforce's own maintained search service, not a live fetch - if a page isn't in their index, this falls back to the browser automatically, but it's still bounded by what they've indexed.
- **The Playwright fallback is not a guaranteed bypass for every bot-detection system.** This works against the specific blocking behavior observed on `developer.salesforce.com`. More sophisticated WAFs (Akamai Bot Manager, Cloudflare Bot Management with advanced fingerprinting) can still detect headless browsers - this isn't a general anti-detection toolkit.
- **Scoped to Salesforce domains on purpose.** The skill's instructions only invoke this for `salesforce.com`/`developer.salesforce.com` URLs, not as a general `WebFetch` replacement.
- **First-run cost for the fallback path.** Downloads a Chromium binary (~280MB) on first use per machine - not needed at all if every page you fetch happens to be MCP-indexed, but still required up front since there's no way to know that in advance.
- **Trust model.** `fetch.js` takes a URL as an argument and doesn't itself enforce a domain allowlist - it trusts `SKILL.md`'s instructions to only invoke it on legitimate Salesforce doc URLs, the same way any Claude Code skill trusts its own bundled scripts. The MCP call sends that same URL to a third-party (Salesforce) endpoint as a plain HTTP request.

## License

MIT - see [LICENSE](./LICENSE).
