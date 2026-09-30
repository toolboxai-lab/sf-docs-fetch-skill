# sf-docs-fetch

A [Claude Code](https://claude.com/claude-code) skill that fetches `developer.salesforce.com` pages when Claude Code's built-in `WebFetch` tool gets blocked.

## The problem

Salesforce's developer docs site (particularly the ISVforce Guide under `developer.salesforce.com/docs/platform/isvforce/`) returns an HTTP 403 to Claude Code's `WebFetch` tool, even though the identical URL loads fine in a real browser. This looks like bot/WAF detection blocking the plain HTTP request `WebFetch` sends - no JavaScript execution, and a request fingerprint (TLS/HTTP2 handshake, headers) that doesn't look like a real browser.

## The fix

This skill drives a real headless Chromium browser via [Playwright](https://playwright.dev/) instead of a bare HTTP request. That presents a realistic browser fingerprint, which gets past the block. It's scoped to Salesforce domains specifically - it's a targeted fallback, not a general-purpose scraper.

## Install

Clone this repo directly into your Claude Code skills folder:

```bash
git clone https://github.com/<your-username>/sf-docs-fetch-skill.git ~/.claude/skills/sf-docs-fetch
```

(Or clone anywhere and copy the folder in - the skill works from wherever it's actually installed under `~/.claude/skills/`.)

The first time Claude Code actually uses the skill, it'll run the one-time setup itself (installing the `playwright` npm package and downloading a Chromium browser binary, per `SKILL.md`). You don't need to do this manually - just have the repo in place.

**Requirements:** Node.js 18+.

## How it works

- `SKILL.md` - the instructions Claude Code reads to know when and how to use this skill.
- `fetch.js` - the actual fetch script. Takes a URL, launches headless Chromium, waits for the page to render, and prints the visible text content (`document.body.innerText`) to stdout.
- `test.js` - a regression test (`npm test`) that checks the fetch script against two real, known-blocked Salesforce doc pages, plus one deliberately-bad URL to confirm failure handling works cleanly.

## Limitations

- **Not a guaranteed bypass for every bot-detection system.** This works against the specific blocking behavior observed on `developer.salesforce.com`. More sophisticated WAFs (Akamai Bot Manager, Cloudflare Bot Management with advanced fingerprinting) can still detect headless browsers - this isn't a general anti-detection toolkit.
- **Scoped to Salesforce domains on purpose.** The skill's instructions only invoke this for `salesforce.com`/`developer.salesforce.com` URLs, not as a general `WebFetch` replacement.
- **First-run cost.** Downloads a Chromium binary (~280MB) on first use per machine.
- **Trust model.** `fetch.js` takes a URL as an argument and doesn't itself enforce a domain allowlist - it trusts `SKILL.md`'s instructions to only invoke it on legitimate Salesforce doc URLs, the same way any Claude Code skill trusts its own bundled scripts.

## License

MIT - see [LICENSE](./LICENSE).
