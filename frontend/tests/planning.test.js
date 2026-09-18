import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCandidates, comparePlans, createBrief, selectionReason, DEMO_REPORTS } from '../src/planning.js';
const ids = plan => plan.selected.map(row => row.id).sort();
const report = (id, blockage, score, priority = 'Medium') => ({ id, location: `Site ${id}`, blockage, score, priority, latitude: 6.3, longitude: 5.6 });

test('fictional comparison makes a real trade-off at budget four', () => {
  const rows = makeCandidates(DEMO_REPORTS, {}, true);
  const plans = comparePlans(rows, 4);
  assert.deepEqual(ids(plans.priority), ['demo-a']);
  assert.deepEqual(ids(plans.efficient), ['demo-b', 'demo-c', 'demo-d']);
  assert.equal(plans.priority.reduction, 50);
  assert.equal(plans.efficient.reduction, 75);
  assert.equal(plans.priority.highCount, 1);
  assert.equal(plans.efficient.highCount, 0);
  assert.equal(plans.efficient.effort, 3);
});

test('editing an estimate changes the feasible combination without changing reports', () => {
  const original = JSON.stringify(DEMO_REPORTS);
  const plans = comparePlans(makeCandidates(DEMO_REPORTS, { 'demo-a': 1 }, true), 4);
  assert.equal(plans.priority.reduction, 125);
  assert.equal(plans.efficient.reduction, 125);
  assert.equal(plans.efficient.selected.length, 4);
  assert.equal(JSON.stringify(DEMO_REPORTS), original);
});

test('saved-report defaults are equal; no-blockage observations are excluded', () => {
  const source = [report(1, 'Full', 100), report(2, 'None', 50), report(3, 'Partial', 25)];
  const rows = makeCandidates(source);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.effort), [2, 2]);
  assert.deepEqual(rows.map(row => row.reduction), [50, 25]);
});

test('empty input, zero budget, and unaffordable candidates produce empty plans', () => {
  for (const [rows, budget] of [[[], 4], [makeCandidates(DEMO_REPORTS, {}, true), 0], [makeCandidates([report(1, 'Full', 100)]), 1]]) {
    const plans = comparePlans(rows, budget);
    for (const plan of Object.values(plans)) {
      assert.equal(plan.reduction, 0);
      assert.equal(plan.effort, 0);
      assert.equal(plan.selected.length, 0);
    }
  }
});

test('priority-first skips an unaffordable report and keeps considering lower scores', () => {
  const rows = makeCandidates([report('a', 'Full', 100, 'High'), report('b', 'Partial', 25, 'Low')], { a: 5, b: 1 });
  const plans = comparePlans(rows, 2);
  assert.deepEqual(ids(plans.priority), ['b']);
  assert.match(selectionReason(rows[0], plans.priority, 'priority', 2), /entire budget/);
});

test('ties use original scores, effort, and IDs consistently across input order', () => {
  const rows = makeCandidates([report('a', 'Partial', 55), report('b', 'Partial', 45), report('c', 'Partial', 55)], { a: 2, b: 1, c: 1 });
  assert.deepEqual(ids(comparePlans(rows, 2).efficient), ['b', 'c']);
  const tied = makeCandidates([report('c', 'Partial', 55), report('a', 'Partial', 55)], { a: 1, c: 1 });
  assert.deepEqual(ids(comparePlans(tied, 1).efficient), ['a']);
  assert.deepEqual(ids(comparePlans([...tied].reverse(), 1).efficient), ['a']);
  const sameValue = makeCandidates([report('a', 'Full', 80), report('b', 'Full', 100)], { a: 1, b: 2 });
  assert.deepEqual(ids(comparePlans(sameValue, 2).efficient), ['b']);
  sameValue[0].score = 100;
  assert.deepEqual(ids(comparePlans(sameValue, 2).efficient), ['a']);
});

// Independent exhaustive search checks the optimizer, not an imitation of its DP.
function bruteForce(rows, budget) {
  const options = [];
  for (let mask = 0; mask < 2 ** rows.length; mask++) {
    const chosen = rows.filter((_, i) => mask & (1 << i));
    const effort = chosen.reduce((sum, row) => sum + row.effort, 0);
    if (effort <= budget) options.push({
      reduction: chosen.reduce((sum, row) => sum + row.reduction, 0),
      score: chosen.reduce((sum, row) => sum + row.score, 0),
      effort, ids: chosen.map(row => String(row.id)).sort().join('|'),
    });
  }
  return options.sort((a, b) => b.reduction - a.reduction || b.score - a.score || a.effort - b.effort || a.ids.localeCompare(b.ids))[0];
}

test('optimizer agrees with exhaustive subsets for 60 varied fixtures and budgets 0–12', () => {
  let seed = 91273;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let fixture = 0; fixture < 60; fixture++) {
    const rows = Array.from({ length: 7 }, (_, index) => {
      const reduction = random(2) ? 50 : 25;
      const score = reduction + random(2) * 30 + random(2) * 20;
      return { id: String(index), location: `Site ${index}`, reduction, score, effort: random(7) + 1, priority: score >= 70 ? 'High' : score >= 30 ? 'Medium' : 'Low' };
    });
    for (let budget = 0; budget <= 12; budget++) {
      const { efficient, priority } = comparePlans(rows, budget);
      const expected = bruteForce(rows, budget);
      assert.deepEqual([efficient.reduction, efficient.priorityTotal, efficient.effort, ids(efficient).join('|')], [expected.reduction, expected.score, expected.effort, expected.ids]);
      assert.ok(efficient.reduction >= priority.reduction);
      assert.ok(efficient.effort <= budget);
      assert.equal(new Set(ids(efficient)).size, efficient.selected.length);
    }
  }
});

test('100 reports remain bounded and source data stays unchanged', () => {
  const source = Array.from({ length: 100 }, (_, index) => Object.freeze(report(index, 'Full', 100, 'High')));
  Object.freeze(source);
  const plans = comparePlans(makeCandidates(source), 30);
  for (const plan of Object.values(plans)) {
    assert.equal(plan.selected.length, 15);
    assert.equal(plan.reduction, 750);
    assert.equal(plan.effort, 30);
  }
  assert.equal(source[0].effort, undefined);
});

test('brief records both plans, all estimates, assumptions, and fictional source', () => {
  const candidates = makeCandidates(DEMO_REPORTS, {}, true);
  const plans = comparePlans(candidates, 4);
  const brief = createBrief({ candidates, plans, budget: 4, example: true, generatedAt: '2026-09-18T00:00:00Z' });
  for (const text of ['FICTIONAL EXAMPLE', 'HIGHEST PRIORITY FIRST', 'LARGEST SCORE DECREASE', 'Effort used: 3/4', '50 points', '75 points', 'Difference in illustrative decrease: 25', 'ALL CANDIDATE ESTIMATES', 'not measured flood reductions', 'not a fieldwork instruction', 'demo-e']) assert.ok(brief.includes(text), text);
  assert.ok(!brief.includes('undefined'));
  const saved = makeCandidates([report(4, 'Partial', 25, 'Low')]);
  const savedBrief = createBrief({ candidates: saved, plans: comparePlans(saved, 3), budget: 3, example: false });
  assert.match(savedBrief, /Coordinates: 6.3, 5.6/);
  assert.match(savedBrief, /unverified/);
});

test('invalid estimates, budgets, or duplicate candidate IDs are rejected', () => {
  for (const effort of [0, -1, 11, 1.5, NaN, 'bad']) assert.throws(() => makeCandidates([report('a', 'Full', 100)], { a: effort }), RangeError);
  for (const budget of [-1, 31, 1.5, NaN, '4']) assert.throws(() => comparePlans([], budget), RangeError);
  const row = makeCandidates([report('a', 'Full', 100)])[0];
  assert.throws(() => comparePlans([row, row], 4), /counted twice/);
});
