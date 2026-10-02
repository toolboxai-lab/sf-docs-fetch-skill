#!/usr/bin/env node
// Regression test for fetch.js - confirms the MCP-first path returns real
// content for known-indexed Salesforce URLs, that the headless-browser
// fallback still works on its own, and that failure handling behaves sanely
// on a bad URL. Run with: npm test

const { spawnSync } = require('child_process');
const path = require('path');

const FETCH_SCRIPT = path.join(__dirname, 'fetch.js');

const CASES = [
  {
    name: 'security-review-guidelines.html returns real content via MCP',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/security-review-guidelines.html',
    expectSuccess: true,
    expectedSubstring: 'AgentExchange Security Review',
    expectedSource: 'mcp',
  },
  {
    name: 'secure-code-security-policy-requirements.html returns real content via MCP',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/secure-code-security-policy-requirements.html',
    expectSuccess: true,
    expectedSubstring: 'Security Policy Requirements',
    expectedSource: 'mcp',
  },
  {
    // Exercises the organic tryMcp() -> null -> fall-through decision in
    // main() itself (not the forced-off escape hatch below, which skips
    // that whole code path rather than testing it). A regression here
    // (e.g. an inverted `if (mcpContent)` check) would only be caught by
    // this case.
    name: 'organic MCP miss (simulated) falls through to the real browser',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/security-review-guidelines.html',
    expectSuccess: true,
    expectedSubstring: 'AgentExchange Security Review',
    expectedSource: 'playwright',
    simulateMcpMiss: true,
  },
  {
    name: 'help.salesforce.com URL missing the release param resolves via search bridge',
    url: 'https://help.salesforce.com/s/articleView?id=sales.eac_email_activity_headeronly.htm&type=5',
    expectSuccess: true,
    expectedSubstring: 'Email Data Capture Configuration',
    expectedSource: 'mcp',
  },
  {
    name: 'Playwright fallback branch works on its own (MCP forced off)',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/security-review-guidelines.html',
    expectSuccess: true,
    expectedSubstring: 'AgentExchange Security Review',
    expectedSource: 'playwright',
    forcePlaywright: true,
  },
  {
    name: 'a nonexistent page fails cleanly (non-zero exit, no crash)',
    url: 'https://developer.salesforce.com/docs/this-page-does-not-exist-404-test',
    expectSuccess: false,
  },
];

let failures = 0;

for (const testCase of CASES) {
  process.stdout.write(`- ${testCase.name} ... `);

  const env = { ...process.env };
  if (testCase.forcePlaywright) env.SF_DOCS_FETCH_FORCE_PLAYWRIGHT = '1';
  if (testCase.simulateMcpMiss) env.SF_DOCS_FETCH_SIMULATE_MCP_MISS = '1';

  const result = spawnSync('node', [FETCH_SCRIPT, testCase.url], {
    encoding: 'utf8',
    timeout: 45000,
    env,
  });
  const output = result.stdout || '';
  const stderr = result.stderr || '';
  const succeeded = result.status === 0;

  if (!testCase.expectSuccess) {
    if (succeeded) {
      console.log('FAIL (expected non-zero exit, got success)');
      failures++;
    } else {
      console.log('PASS (failed as expected)');
    }
    continue;
  }

  if (!succeeded) {
    console.log(`FAIL (expected success, got error: ${stderr.trim().split('\n')[0]})`);
    failures++;
    continue;
  }
  if (testCase.expectedSubstring && !output.includes(testCase.expectedSubstring)) {
    console.log(`FAIL (missing expected content: "${testCase.expectedSubstring}")`);
    console.log(`  Got: ${output.slice(0, 200)}...`);
    failures++;
    continue;
  }
  if (testCase.expectedSource && !stderr.includes(`source: ${testCase.expectedSource}`)) {
    console.log(`FAIL (expected source "${testCase.expectedSource}", stderr: ${stderr.trim()})`);
    failures++;
    continue;
  }
  console.log('PASS');
}

console.log('');
if (failures > 0) {
  console.log(`${failures} of ${CASES.length} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`All ${CASES.length} test(s) passed.`);
  process.exit(0);
}
