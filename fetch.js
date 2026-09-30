#!/usr/bin/env node
// Fetches a URL using a real headless browser (Playwright/Chromium) instead of
// a bare HTTP request, so it presents the TLS/HTTP2 fingerprint, JS execution,
// and header set of a real browser rather than a simple scripted fetch.
// developer.salesforce.com (and salesforce.com generally) blocks Claude Code's
// built-in WebFetch tool with a 403 - this is the workaround.
//
// Usage: node fetch.js <url>
// Prints the rendered page's visible text content to stdout.

const { chromium } = require('playwright');

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node fetch.js <url>');
    process.exit(1);
  }

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
      console.error(`No response received for ${url}`);
      process.exit(1);
    }

    const status = response.status();
    if (status >= 400) {
      console.error(`Got HTTP ${status} even via headless browser for ${url}`);
      process.exit(1);
    }

    // innerText approximates what a reader actually sees - closer to what
    // WebFetch would normally hand back than raw HTML would be.
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('fetch.js failed:', err.message);
  process.exit(1);
});
