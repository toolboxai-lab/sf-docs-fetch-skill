#!/usr/bin/env node
// Regression test for fetch.js - confirms the headless-browser fetch still
// works against real, known-blocked-by-WebFetch Salesforce URLs, and that
// failure handling behaves sanely on a bad URL. Run with: npm test

const { execFileSync } = require('child_process');
const path = require('path');

const FETCH_SCRIPT = path.join(__dirname, 'fetch.js');

const CASES = [
  {
    name: 'security-review-guidelines.html returns real content',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/security-review-guidelines.html',
    expectSuccess: true,
    expectedSubstring: 'AgentExchange Security Review',
  },
  {
    name: 'security-review-prepare.html returns real content',
    url: 'https://developer.salesforce.com/docs/platform/isvforce/guide/security-review-prepare.html',
    expectSuccess: true,
    expectedSubstring: 'AgentExchange security review tests the security posture',
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
  try {
    const output = execFileSync('node', [FETCH_SCRIPT, testCase.url], {
      encoding: 'utf8',
      timeout: 45000,
    });

    if (!testCase.expectSuccess) {
      console.log('FAIL (expected non-zero exit, got success)');
      failures++;
      continue;
    }
    if (testCase.expectedSubstring && !output.includes(testCase.expectedSubstring)) {
      console.log(`FAIL (missing expected content: "${testCase.expectedSubstring}")`);
      console.log(`  Got: ${output.slice(0, 200)}...`);
      failures++;
      continue;
    }
    console.log('PASS');
  } catch (err) {
    if (testCase.expectSuccess) {
      console.log(`FAIL (expected success, got error: ${err.message.split('\n')[0]})`);
      failures++;
    } else {
      console.log('PASS (failed as expected)');
    }
  }
}

console.log('');
if (failures > 0) {
  console.log(`${failures} of ${CASES.length} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`All ${CASES.length} test(s) passed.`);
  process.exit(0);
}
