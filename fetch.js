#!/usr/bin/env node
// Fetches a Salesforce doc URL. Tries the official Salesforce Docs MCP first
// (https://labs.agentforce.com/docs/salesforce-docs-mcp) - it's a published,
// unauthenticated HTTP endpoint, so this calls it directly with no setup, no
// `claude mcp add`, and no restart required. If the MCP doesn't have the page
// indexed (or errors/times out), falls back to a real headless browser
// (Playwright/Chromium), which is what gets past WebFetch's 403 on pages the
// MCP hasn't indexed.
//
// Usage: node fetch.js <url>
// Prints the page content to stdout. Prints which path served the content
// ("mcp" or "playwright") to stderr, for diagnostics.

const MCP_ENDPOINT = 'https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp';
const MCP_TIMEOUT_MS = 10000;

async function mcpCall(toolName, args) {
  // Escape hatch for the test suite, to exercise the organic "MCP genuinely
  // has nothing" decision path in main() (tryMcp resolving to null, not
  // throwing) without depending on a real URL staying un-indexed forever -
  // every known-blocked ISVforce page tested so far has ended up indexed.
  if (process.env.SF_DOCS_FETCH_SIMULATE_MCP_MISS) return null;

  const res = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (data?.result?.isError) return null;

  const raw = data?.result?.content?.[0]?.text;
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function mcpFetchById(id) {
  const parsed = await mcpCall('salesforce_docs_fetch', { id });
  return parsed?.content ? parsed : null;
}

// help.salesforce.com URLs embed a release-version query param
// (e.g. &release=264.0.0) that the MCP's fetch-by-URL lookup matches
// exactly - a URL missing that param, or carrying a different release
// number than whatever the MCP indexed, misses even though the article is
// genuinely indexed. developer.salesforce.com URLs don't have this problem
// (no release param), so this bridge only applies to help.salesforce.com.
//
// Search finds the article regardless of release number, but isn't a
// reliable top-1 match (confirmed: a bare-slug search ranked the right
// article 3rd), so this only accepts a result whose documentPath is an
// exact match for the slug - never just the top hit.
async function resolveHelpArticleUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  if (parsedUrl.hostname !== 'help.salesforce.com') return null;

  const idParam = parsedUrl.searchParams.get('id');
  if (!idParam) return null;

  // "sales.eac_email_activity_headeronly.htm" -> "eac_email_activity_headeronly"
  const withoutExt = idParam.replace(/\.html?$/i, '');
  const dotIndex = withoutExt.indexOf('.');
  const slug = dotIndex === -1 ? withoutExt : withoutExt.slice(dotIndex + 1);
  if (!slug) return null;

  const searchResult = await mcpCall('salesforce_docs_search', {
    query: slug,
    search_mode: 'hybrid',
    limit: 10,
  });
  if (!searchResult?.chunks) return null;

  const slugPattern = new RegExp(`/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.html?$`, 'i');
  const exactMatch = searchResult.chunks.find(
    (c) => c.documentPath && slugPattern.test(c.documentPath)
  );
  return exactMatch?.url || null;
}

async function tryMcp(url) {
  const direct = await mcpFetchById(url);
  if (direct) return direct;

  const resolvedUrl = await resolveHelpArticleUrl(url);
  if (!resolvedUrl) return null;

  return mcpFetchById(resolvedUrl);
}

// Purely diagnostic - the MCP's search/fetch tools don't report how current
// their content is, but a separate `collection://list` resource reports a
// last_indexed timestamp per collection. This looks that up so it can be
// printed alongside the content, not to decide whether to trust the result:
// there's no clean staleness cutoff (Salesforce's own release cadence is
// ~4 months), so any failure here just means no timestamp gets printed,
// never a fall-through to Playwright.
async function getCollectionLastIndexed(collection) {
  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: 'collection://list' },
      }),
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const raw = data?.result?.contents?.[0]?.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const match = parsed?.collections?.find((c) => c.collection === collection);
    return match?.last_indexed || null;
  } catch {
    return null;
  }
}

async function fetchWithPlaywright(url) {
  const { chromium } = require('playwright');

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    if (!response) {
      throw new Error(`No response received for ${url}`);
    }

    const status = response.status();
    if (status >= 400) {
      throw new Error(`Got HTTP ${status} even via headless browser for ${url}`);
    }

    // innerText approximates what a reader actually sees - closer to what
    // WebFetch would normally hand back than raw HTML would be.
    return await page.evaluate(() => document.body.innerText);
  } finally {
    await browser.close();
  }
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node fetch.js <url>');
    process.exit(1);
  }

  // Escape hatch for the test suite, to exercise the Playwright branch
  // directly without depending on finding a real page the MCP hasn't
  // indexed (every known-blocked ISVforce page tested so far is indexed).
  if (!process.env.SF_DOCS_FETCH_FORCE_PLAYWRIGHT) {
    try {
      const mcpResult = await tryMcp(url);
      if (mcpResult?.content) {
        const lastIndexed = await getCollectionLastIndexed(mcpResult.collection);
        const suffix = lastIndexed
          ? ` (collection "${mcpResult.collection}" last indexed: ${lastIndexed})`
          : '';
        console.error(`[fetch.js] source: mcp${suffix}`);
        console.log(mcpResult.content);
        return;
      }
    } catch {
      // MCP unreachable, timed out, or errored - fall through to Playwright.
    }
  }

  console.error('[fetch.js] source: playwright');
  console.log(await fetchWithPlaywright(url));
}

main().catch((err) => {
  console.error('fetch.js failed:', err.message);
  process.exit(1);
});
