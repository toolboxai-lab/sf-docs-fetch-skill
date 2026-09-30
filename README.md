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
