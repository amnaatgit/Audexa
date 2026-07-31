// Automated tests for Audexa fraud-detection core modules.
// Runs with Node's built-in test runner (no external dependencies):
//   node --test
// These tests exercise the pure, database-free modules so they run
// anywhere without a Postgres connection or environment secrets.

const test = require('node:test');
const assert = require('node:assert');

const { evaluate } = require('../ml/metrics');
const { IsolationForest, featureVector } = require('../ml/isolationForest');
const dataset = require('../ml/dataset');
const rules = require('../engine/rules');

test('metrics.evaluate scores perfect separation as ideal', () => {
  // Frauds (label 1) all score higher than legitimate (label 0).
  const pairs = [
    { score: 0.95, label: 1 },
    { score: 0.90, label: 1 },
    { score: 0.85, label: 1 },
    { score: 0.20, label: 0 },
    { score: 0.15, label: 0 },
    { score: 0.10, label: 0 },
  ];
  const m = evaluate(pairs, 0.5);
  assert.ok(m && typeof m === 'object', 'returns a metrics object');
  assert.ok(typeof m.auprc === 'number', 'reports auprc');
  assert.ok(m.auprc > 0.99, 'perfect separation gives auprc ~ 1, got ' + m.auprc);
  assert.strictEqual(m.precision, 1, 'no false positives at threshold 0.5');
  assert.strictEqual(m.recall, 1, 'no false negatives at threshold 0.5');
});

test('metrics.evaluate penalises a useless (random-like) scorer', () => {
  // Interleaved scores: fraud and legit indistinguishable.
  const pairs = [
    { score: 0.9, label: 0 },
    { score: 0.8, label: 1 },
    { score: 0.7, label: 0 },
    { score: 0.6, label: 1 },
    { score: 0.5, label: 0 },
    { score: 0.4, label: 1 },
  ];
  const m = evaluate(pairs, 0.5);
  assert.ok(m.auprc < 0.95, 'a poor separator should not score near-perfect, got ' + m.auprc);
});

test('IsolationForest scores an outlier higher than an inlier', () => {
  // Build a tight cluster of normal rows, then compare an inlier vs a clear outlier.
  const rows = [];
  for (let i = 0; i < 200; i++) {
    rows.push([1 + Math.random() * 0.1, 1 + Math.random() * 0.1]);
  }
  const forest = new IsolationForest({ nTrees: 60, sampleSize: 64 });
  forest.fit(rows);
  const inlier = forest.score([1.05, 1.05]);
  const outlier = forest.score([50, 50]);
  assert.ok(typeof inlier === 'number' && typeof outlier === 'number', 'scores are numeric');
  assert.ok(outlier > inlier, 'outlier (' + outlier + ') should score above inlier (' + inlier + ')');
});

test('featureVector produces a numeric feature array', () => {
  const inv = { amount: 5000, hour: 3, jurisdiction: 'KP', isDuplicate: true };
  const vec = featureVector(inv, 1000);
  assert.ok(Array.isArray(vec), 'returns an array');
  assert.ok(vec.length > 0, 'feature vector is non-empty');
  assert.ok(vec.every((v) => typeof v === 'number' && Number.isFinite(v)), 'all features are finite numbers');
});

test('dataset.generate yields labelled data with a plausible fraud rate', () => {
  const n = 400;
  const rate = 0.12;
  const data = dataset.generate(n, rate);
  assert.strictEqual(data.length, n, 'generates the requested number of records');
  assert.ok(data.every((d) => d.label === 0 || d.label === 1), 'every record is labelled 0 or 1');
  const frauds = data.filter((d) => d.label === 1).length;
  const observed = frauds / n;
  // Allow generous tolerance for randomness around the target rate.
  assert.ok(observed > rate - 0.08 && observed < rate + 0.08,
    'observed fraud rate ' + observed.toFixed(3) + ' near target ' + rate);
});

test('rules expose a non-empty rule set and geo-risk table', () => {
  assert.ok(Array.isArray(rules.RULES) && rules.RULES.length > 0, 'RULES is a non-empty array');
  assert.ok(rules.GEO_RISK && typeof rules.GEO_RISK === 'object', 'GEO_RISK is an object');
});

test('high-risk jurisdictions carry more geo risk than low-risk ones', () => {
  const g = rules.GEO_RISK;
  // Sanctioned / high-risk jurisdictions should not be treated as safer than
  // established low-risk ones. Compare when both are present.
  if (g.KP !== undefined && g.US !== undefined) {
    assert.ok(g.KP >= g.US, 'KP risk (' + g.KP + ') should be >= US risk (' + g.US + ')');
  }
  if (g.IR !== undefined && g.GB !== undefined) {
    assert.ok(g.IR >= g.GB, 'IR risk (' + g.IR + ') should be >= GB risk (' + g.GB + ')');
  }
});
