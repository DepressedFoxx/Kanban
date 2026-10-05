import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const report = JSON.parse(
  readFileSync('output/playwright/cloud-verification.json', 'utf8'),
)
assert.equal(
  report.completed,
  true,
  'Cloud run must complete before acceptance',
)
assert.ok(
  Date.now() - Date.parse(report.finishedAt) < 24 * 60 * 60 * 1000,
  'Run cloud verification again: report is stale',
)
assert.equal(report.benchmark.length, 5, 'Require five trials')
const samples = report.benchmark
  .flatMap((trial) => {
    assert.equal(
      trial.millisecondsFromRequestStart.length,
      5,
      'Require five sessions per trial',
    )
    return trial.millisecondsFromRequestStart
  })
  .sort((a, b) => a - b)
assert.ok(
  samples.every((ms) => Number.isFinite(ms) && ms > 0 && ms <= 2000),
  'Every realtime sample must be within the agreed 2000ms budget',
)
console.log(
  JSON.stringify({
    samples: samples.length,
    min: samples[0],
    median: samples[12],
    p95: samples[23],
    max: samples[24],
    budgetMs: 2000,
  }),
)
