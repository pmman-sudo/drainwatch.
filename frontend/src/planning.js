// Illustrative scenarios only: no report writes or network requests.
export const MAX_BUDGET = 30;
export const MAX_EFFORT = 10;
export const DEFAULT_EFFORT = 2;
export const DEMO_REPORTS = Object.freeze([
  { id: 'demo-a', location: 'DEMO — Junction A', blockage: 'Full', score: 100, priority: 'High', exampleEffort: 4 },
  { id: 'demo-b', location: 'DEMO — Junction B', blockage: 'Partial', score: 55, priority: 'Medium', exampleEffort: 1 },
  { id: 'demo-c', location: 'DEMO — Junction C', blockage: 'Partial', score: 45, priority: 'Medium', exampleEffort: 1 },
  { id: 'demo-d', location: 'DEMO — Junction D', blockage: 'Partial', score: 25, priority: 'Low', exampleEffort: 1 },
  { id: 'demo-e', location: 'DEMO — Junction E', blockage: 'Full', score: 80, priority: 'High', exampleEffort: 5 },
].map(report => Object.freeze({ ...report, description: 'Fictional planning example; not a verified incident.' })));

const compareId = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
const rankPriority = (a, b) => b.score - a.score || b.reduction - a.reduction || compareId(a, b);

export function makeCandidates(reports, estimates = {}, example = false) {
  return reports.filter(report => ['Partial', 'Full'].includes(report.blockage)).map(report => {
    const effort = Number(estimates[report.id] ?? (example ? report.exampleEffort : DEFAULT_EFFORT));
    if (!Number.isInteger(effort) || effort < 1 || effort > MAX_EFFORT) {
      throw new RangeError(`Effort for report ${report.id} must be a whole number from 1 to ${MAX_EFFORT}.`);
    }
    return { ...report, reduction: report.blockage === 'Full' ? 50 : 25, effort };
  });
}

function summarize(selected) {
  return {
    selected: [...selected].sort(rankPriority),
    effort: selected.reduce((sum, row) => sum + row.effort, 0),
    reduction: selected.reduce((sum, row) => sum + row.reduction, 0),
    priorityTotal: selected.reduce((sum, row) => sum + row.score, 0),
    highCount: selected.filter(row => row.priority === 'High').length,
  };
}

function better(a, b) {
  if (a.reduction !== b.reduction) return a.reduction > b.reduction;
  if (a.priorityTotal !== b.priorityTotal) return a.priorityTotal > b.priorityTotal;
  if (a.effort !== b.effort) return a.effort < b.effort;
  const left = [...a.selected].sort(compareId);
  const right = [...b.selected].sort(compareId);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = compareId(left[i], right[i]);
    if (order) return order < 0;
  }
  return left.length < right.length;
}

export function comparePlans(candidates, budget) {
  if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET) {
    throw new RangeError(`Budget must be a whole number from 0 to ${MAX_BUDGET}.`);
  }
  const ids = new Set();
  for (const row of candidates) {
    if (ids.has(String(row.id))) throw new Error('A report cannot be counted twice.');
    ids.add(String(row.id));
    if (!Number.isInteger(row.effort) || row.effort < 1 || row.effort > MAX_EFFORT ||
        ![25, 50].includes(row.reduction) || !Number.isFinite(row.score) || row.score < row.reduction || row.score > 100) {
      throw new RangeError('Invalid planning candidate.');
    }
  }
  let remaining = budget;
  const selected = [];
  for (const row of [...candidates].sort(rankPriority)) {
    if (row.effort <= remaining) {
      selected.push(row);
      remaining -= row.effort;
    }
  }
  // Exact 0/1 knapsack. Descending capacities prevent reusing an observation.
  const best = Array.from({ length: budget + 1 }, () => summarize([]));
  for (const row of [...candidates].sort(compareId)) {
    for (let capacity = budget; capacity >= row.effort; capacity--) {
      const option = summarize([...best[capacity - row.effort].selected, row]);
      if (better(option, best[capacity])) best[capacity] = option;
    }
  }
  return { priority: summarize(selected), efficient: best[budget] };
}

export function selectionReason(row, plan, strategy, budget) {
  if (plan.selected.some(item => item.id === row.id)) return strategy === 'priority'
    ? 'Selected in descending score order because it fits the remaining budget.'
    : 'Included in the combination with the largest total blockage-score decrease within budget.';
  if (row.effort > budget) return 'Its effort estimate exceeds the entire budget.';
  return strategy === 'priority'
    ? 'Higher-ranked reports consumed the budget needed for this report.'
    : 'Another combination achieved a larger decrease, or won the stated tie-break.';
}

export function createBrief({ candidates, plans, budget, example, generatedAt = new Date().toISOString() }) {
  const lines = [
    'DRAINWATCH — PLANNING COMPARISON BRIEF', `Generated: ${generatedAt}`,
    `Source: ${example ? 'FICTIONAL EXAMPLE — no public reports created' : 'Latest loaded community reports (up to 100); unverified'}`,
    `Budget: ${budget} illustrative effort units. These are not measured work hours or costs.`,
    `Eligible observations: ${candidates.length}. Each observation is assumed to represent a distinct site.`,
    'Assumes complete blockage removal; standing-water and nearby-building contributions remain unchanged.',
    'Score decreases are illustrative, not measured flood reductions or evidence of people protected.',
    'Effort estimates are scenario inputs. Actual effort, access, and conditions require professional assessment.',
    'No travel time, drainage connectivity, rainfall, or site deduplication is modeled. Saved reports are unchanged.', '',
  ];
  for (const [key, title] of [['priority', 'HIGHEST PRIORITY FIRST'], ['efficient', 'LARGEST SCORE DECREASE']]) {
    const plan = plans[key];
    lines.push(title, `Selected reports: ${plan.selected.length}; high priority: ${plan.highCount}.`,
      `Effort used: ${plan.effort}/${budget}; unused: ${budget - plan.effort}.`,
      `Illustrative score decrease: ${plan.reduction} points.`);
    if (!plan.selected.length) lines.push('No eligible observation fits this budget.');
    plan.selected.forEach((row, index) => {
      lines.push(`${index + 1}. ${row.location} (#${row.id})`,
        `   ${row.priority} priority; ${row.blockage} blockage; effort: ${row.effort} units.`,
        `   Score: ${row.score} -> ${row.score - row.reduction} (${row.reduction} points).`,
        `   ${example ? 'Fictional example, no incident coordinates.' : `Coordinates: ${row.latitude}, ${row.longitude}`}`,
        `   ${selectionReason(row, plan, key, budget)}`);
    });
    lines.push('');
  }
  lines.push(`Difference in illustrative decrease: ${plans.efficient.reduction - plans.priority.reduction} points.`,
    'The larger score decrease does not establish a safer or more urgent real-world plan.',
    'Priority-first ties: larger blockage contribution, then report ID.',
    'Largest-decrease ties: higher combined original score, lower effort, then report IDs.', '',
    'ALL CANDIDATE ESTIMATES AND SELECTION REASONS');
  for (const row of [...candidates].sort(rankPriority)) {
    lines.push(`${row.location} (#${row.id}): effort ${row.effort}; score ${row.score}; removable ${row.reduction}.`,
      `  Priority first: ${selectionReason(row, plans.priority, 'priority', budget)}`,
      `  Largest decrease: ${selectionReason(row, plans.efficient, 'efficient', budget)}`);
  }
  lines.push('', 'Request verification and safe-access assessment from an authorized maintenance team.',
    'Do not enter floodwater or drains. This is an illustrative review brief, not a fieldwork instruction.');
  return lines.join('\n');
}
