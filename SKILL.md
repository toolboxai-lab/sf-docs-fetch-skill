---
name: sf-docs-fetch
description: Fetches developer.salesforce.com / salesforce.com pages when Claude Code's built-in WebFetch tool returns a 403 Forbidden or otherwise fails to retrieve content. Salesforce's developer docs site (especially the ISVforce Guide under developer.salesforce.com/docs/platform/isvforce/) blocks WebFetch's plain HTTP request with bot detection, even though the same URL loads fine in a real browser. Use this skill immediately whenever WebFetch fails on any salesforce.com or developer.salesforce.com URL - don't give up on the page or ask the user to paste its content manually until this fallback has been tried.
---

# SF Docs Fetch

## Why this exists

Claude Code's `WebFetch` tool sends a lightweight HTTP request - no JavaScript execution, a different TLS/HTTP2 fingerprint than a real browser, and a User-Agent that bot-detection systems (Akamai, Cloudflare, or Salesforce's own edge security) can fingerprint and block. `developer.salesforce.com` does exactly this: its docs pages return a 403 to `WebFetch` even though the identical URL renders normally in an actual browser.

This skill drives a real headless Chromium browser via Playwright instead, which presents a realistic fingerprint and gets past that specific block.

## When to use this

Whenever a `WebFetch` call on a `salesforce.com` or `developer.salesforce.com` URL fails - a 403, an empty body, or any other clear block - reach for this instead of giving up on the page or asking the user to paste its content by hand. Try `WebFetch` first since it's faster when it works; fall back to this only when it doesn't.

This is scoped to Salesforce domains specifically. It's not a general-purpose scraper - most sites don't need this, and reaching for a headless browser by default would be slower and heavier than necessary.

## How to use it

1. **First-time setup** (only needed once per machine): check whether `node_modules` exists in *this skill's own directory* (wherever it's actually installed - don't assume a specific path; work relative to where this SKILL.md itself lives). If not, first confirm Node is available:
   ```bash
   node --version
   ```
   This needs Node.js 18 or later already installed on the machine. If `node --version` fails (command not found) or reports a version below 18, stop here and tell the user - installing/upgrading Node itself is outside this skill's scope and depends on their OS/package manager.

   If Node is present, `cd` into this skill's directory and install dependencies:
   ```bash
   npm install && npx playwright install --with-deps chromium
   ```
   The `npx playwright install` step downloads the actual browser binary Playwright drives (~280MB) - `npm install` alone only installs the JS library, not the browser itself. `--with-deps` also installs the OS-level shared libraries Chromium needs to actually launch on Linux (without it, the download succeeds but the browser can fail to start with cryptic shared-library errors) - it's a no-op on macOS/Windows, so it's safe to always include.

   If this step fails: a corporate firewall may be blocking Playwright's CDN download domain specifically (even when general internet access works), or antivirus/endpoint security may quarantine the downloaded browser binary as an unsigned executable. Both are environment-specific network/security policy issues, not a bug in this skill - they need to be resolved with whoever manages that machine's network/security policy.

2. **Fetch the page**:
   ```bash
   node fetch.js "<url>"
   ```
   Run this from inside the skill's own directory (`fetch.js` lives alongside this SKILL.md, wherever that ends up being installed). This prints the rendered page's visible text content to stdout. Treat that output the same way you'd treat a successful `WebFetch` result - read it, summarize it, or answer the user's question from it.

3. **If it still fails**: the script exits non-zero and prints the reason to stderr (e.g. still getting a non-2xx status even via the headless browser). At that point, this specific page may need the user to paste its content manually - don't loop retrying the same URL.

## Notes

- Each invocation launches and closes a fresh browser - slower than `WebFetch` (a few seconds vs near-instant), so don't use it as the default first attempt everywhere, only as the fallback for Salesforce domains.
- The script reads `document.body.innerText`, which approximates what a human reader sees (rendered, not raw HTML) - closer to what `WebFetch` normally returns than a raw HTML dump would be.
