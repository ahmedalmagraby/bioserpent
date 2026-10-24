#!/usr/bin/env node
// tests/run-all-tests.js — Master Automated Test Runner for BioSerpent
// Executes Tiers 1–4 requirement-driven E2E test suites with comprehensive reporting.

const path = require('path');
const tier1Suite = require('./tier1-feature-tests.js');
const tier2Suite = require('./tier2-boundary-tests.js');
const tier3Suite = require('./tier3-cross-feature-tests.js');
const tier4Suite = require('./tier4-workload-tests.js');
const tier5Suite = require('./tier5-adversarial-hardening.js');
const tier6Suite = require('./tier6-audit-remediation-tests.js');
const tier7Suite = require('./tier7-production-readiness-tests.js');

async function main() {
  const startTime = Date.now();
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║               BIOSERPENT AUTOMATED E2E TEST SUITE RUNNER                  ║');
  console.log('║  Requirement-Driven & Audit Remediation Validation (Tiers 1, 2, 3, 4, 5, 6, 7)║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const suites = [
    { tier: 'Tier 1', desc: 'Core Isolated Features (§R1, §R2, §R4)', runner: tier1Suite },
    { tier: 'Tier 2', desc: 'Boundary & Corner Conditions (§R1, §R2)', runner: tier2Suite },
    { tier: 'Tier 3', desc: 'Cross-Feature Combinations & Invariants', runner: tier3Suite },
    { tier: 'Tier 4', desc: 'Real-World Workload Playthroughs', runner: tier4Suite },
    { tier: 'Tier 5', desc: 'Adversarial Coverage Hardening Matrix', runner: tier5Suite },
    { tier: 'Tier 6', desc: 'Audit Remediation & Optimization Matrix', runner: tier6Suite },
    { tier: 'Tier 7', desc: 'Production Readiness & Regression Hardening (BUG-01 - BUG-28)', runner: tier7Suite }
  ];

  const summary = [];
  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  const allFailures = [];

  for (const s of suites) {
    const res = await s.runner.run(false);
    summary.push({
      tier: s.tier,
      name: res.name,
      desc: s.desc,
      total: res.total,
      passed: res.passed,
      failed: res.failed
    });
    grandTotal += res.total;
    grandPassed += res.passed;
    grandFailed += res.failed;
    if (res.failures && res.failures.length > 0) {
      allFailures.push(...res.failures.map(f => ({ ...f, tier: s.tier })));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                             TEST SUITE SUMMARY                            ║');
  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');

  for (const row of summary) {
    const statusMark = row.failed === 0 ? '✓ PASS' : '✗ FAIL';
    const line = `  ${row.tier.padEnd(8)} │ ${row.name.padEnd(42)} │ ${row.passed}/${row.total} passed │ ${statusMark}`;
    console.log(line);
  }

  console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
  console.log(`  TOTAL    │ 7 Test Suites (${elapsed}s)                        │ ${grandPassed}/${grandTotal} passed │ ${grandFailed === 0 ? '✓ ALL PASS' : '✗ SOME FAILED'}`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  if (grandFailed > 0) {
    console.error(`❌ Test Run Failed: ${grandFailed} test(s) failed out of ${grandTotal}.\n`);
    for (const f of allFailures) {
      console.error(`  [${f.tier}] ${f.name}`);
      console.error(`    ${f.error.message}\n`);
    }
    process.exit(1);
  } else {
    console.log(`✅ All ${grandTotal} tests across Tiers 1-7 PASSED successfully! Zero defects detected.\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
