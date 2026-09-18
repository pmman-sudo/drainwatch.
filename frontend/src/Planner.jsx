import { useMemo, useState } from 'react';
import { MAX_BUDGET, MAX_EFFORT, DEFAULT_EFFORT, DEMO_REPORTS, makeCandidates, comparePlans, selectionReason, createBrief } from './planning.js';
import './planner.css';

function PlanCard({ title, subtitle, plan, budget, kind, candidates }) {
  const omittedHigh = candidates.filter(row => row.priority === 'High' && !plan.selected.some(item => item.id === row.id)).length;
  return <article className={`plan-card ${kind}`} aria-label={title}>
    <p className="eyebrow">{kind === 'priority' ? 'STRATEGY A' : 'STRATEGY B'}</p>
    <h3>{title}</h3><p className="muted">{subtitle}</p>
    <div className="plan-score"><strong>{plan.reduction}</strong><span>illustrative score points removed</span></div>
    <div className="plan-facts"><span><b>{plan.effort}/{budget}</b> effort units</span><span><b>{plan.selected.length}</b> reports selected</span><span><b>{plan.highCount}</b> high priority selected</span></div>
    <progress max={budget || 1} value={plan.effort} aria-label={`${title}: effort used`}/>
    <p className="hint">{budget - plan.effort} units unused · {omittedHigh} high-priority {omittedHigh === 1 ? 'report' : 'reports'} outside this plan</p>
    {plan.selected.length ? <ol className="plan-selected">{plan.selected.map(row => <li key={row.id}>
      <div><b>{row.location}</b><span className={`badge ${row.priority.toLowerCase()}`}>{row.priority}</span></div>
      <p>{row.effort} effort {row.effort === 1 ? 'unit' : 'units'} · Score {row.score} → {row.score - row.reduction}</p>
    </li>)}</ol> : <p className="plan-empty">No report fits. Increase the budget or review your effort estimates.</p>}
  </article>;
}

export default function Planner({ reports }) {
  const [example, setExample] = useState(false);
  const [budget, setBudget] = useState(4);
  const [estimates, setEstimates] = useState({ saved: {}, example: {} });
  const [downloadError, setDownloadError] = useState('');
  const source = useMemo(() => example ? DEMO_REPORTS : reports.slice(0, 100), [example, reports]);
  const group = example ? 'example' : 'saved';
  const candidates = useMemo(() => makeCandidates(source, estimates[group], example), [source, estimates, group, example]);
  const plans = useMemo(() => comparePlans(candidates, budget), [candidates, budget]);
  const difference = plans.efficient.reduction - plans.priority.reduction;
  const same = plans.priority.selected.length === plans.efficient.selected.length && plans.priority.selected.every(row => plans.efficient.selected.some(item => item.id === row.id));

  function download() {
    setDownloadError('');
    try {
      const text = createBrief({ candidates, plans, budget, example });
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = example ? 'drainwatch-fictional-planning-brief.txt' : 'drainwatch-planning-comparison.txt';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError('The brief could not download. Please try again in your browser.');
    }
  }

  return <section className="panel planning-lab" aria-labelledby="planning-title">
    <div className="panel-head"><div><p className="eyebrow">ONE BUDGET. TWO REVIEW PLANS.</p><h2 id="planning-title">Cleanup planning lab</h2></div><span className="planning-tag">Illustrative comparison</span></div>
    <p className="muted planning-intro">Compare which observations fit a limited effort budget. See the trade-off between reviewing the highest scores first and maximizing the blockage-score decrease.</p>
    <div className="planning-source" role="group" aria-label="Planning data source">
      <button type="button" aria-pressed={!example} onClick={() => { setExample(false); setDownloadError(''); }}>Saved reports</button>
      <button type="button" aria-pressed={example} onClick={() => { setExample(true); setDownloadError(''); }}>Try fictional example</button>
    </div>
    {example ? <div className="planning-example" role="status"><b>Fictional example · 5 observations</b><p>Invented reports and effort estimates demonstrate the comparison. Nothing is submitted to the public database.</p></div>
      : <p className="hint">Using {source.length} loaded {source.length === 1 ? 'report' : 'reports'} · {candidates.length} with partial or full blockage · latest 100 at most. Refresh saved reports from the Dashboard.</p>}

    <div className="planning-budget">
      <div><label htmlFor="planning-budget">Available effort budget <output>{budget} units</output></label>
        <input id="planning-budget" type="range" min="1" max={MAX_BUDGET} value={budget} onChange={event => setBudget(Number(event.target.value))} aria-describedby="effort-explanation"/>
        <div className="planning-scale"><span>1 unit</span><span>{MAX_BUDGET} units</span></div></div>
      <p id="effort-explanation">Units are illustrative estimates, not measured hours or costs. Edit each report below. Saved reports start at {DEFAULT_EFFORT} units each; these defaults are not inferred from severity.</p>
    </div>

    {candidates.length ? <>
      <div className="planning-summary" role="status" aria-live="polite"><b>{same ? 'Both strategies select the same reports.' : difference ? `Strategy B removes ${difference} more illustrative score points.` : 'Equal score decrease, different selected reports.'}</b>
        <p>{same ? 'Try a different budget or edit effort estimates to explore other combinations.' : `High-priority reports selected: A ${plans.priority.highCount} · B ${plans.efficient.highCount}. A larger score decrease does not establish a safer or more urgent plan.`}</p></div>
      <div className="planning-comparison">
        <PlanCard title="Highest priority first" subtitle="Take the highest total score that fits, then continue down the list." plan={plans.priority} budget={budget} kind="priority" candidates={candidates}/>
        <PlanCard title="Largest score decrease" subtitle="Choose the combination with the most removable blockage points within budget." plan={plans.efficient} budget={budget} kind="efficient" candidates={candidates}/>
      </div>
      <div className="planning-estimates"><div className="panel-head"><div><h3>Edit effort estimates</h3><p className="muted">Each report is treated as a distinct site. Estimates reset when you leave this page or reload.</p></div>
        <button type="button" className="subtle" onClick={() => setEstimates(previous => ({ ...previous, [group]: {} }))}>Reset estimates</button></div>
        <ul className="planning-candidates">{candidates.map(row => <li key={row.id}>
          <div className="planning-candidate-heading"><div><h4>{row.location}</h4><p>{row.priority} · Score {row.score} · {row.blockage} blockage · {row.reduction} removable points</p></div>
            <label>Effort units<select aria-label={`Effort units for ${row.location}`} value={row.effort} onChange={event => setEstimates(previous => ({ ...previous, [group]: { ...previous[group], [row.id]: Number(event.target.value) } }))}>{Array.from({ length: MAX_EFFORT }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label></div>
          <div className="planning-decisions">{[['priority', 'A'], ['efficient', 'B']].map(([key, label]) => <span key={key} className={plans[key].selected.some(item => item.id === row.id) ? 'included' : ''}>{label}: {plans[key].selected.some(item => item.id === row.id) ? 'Selected' : 'Not selected'}</span>)}</div>
          <details><summary>Why these selections?</summary><p><b>A — </b>{selectionReason(row, plans.priority, 'priority', budget)}</p><p><b>B — </b>{selectionReason(row, plans.efficient, 'efficient', budget)}</p></details>
        </li>)}</ul>
      </div>
    </> : <div className="plan-empty"><h3>No blockage candidates yet</h3><p>Saved reports with partial or full blockage will appear here. Try the fictional example to explore how the plans differ.</p></div>}

    <div className="planning-assumptions"><h3>What this comparison assumes</h3><p>Complete blockage removal at each selected site; standing water and nearby-building contributions remain unchanged. Reports may describe the same site and are not grouped. Travel, rainfall, access, and drainage connections are not modeled.</p>
      <p>These are unverified observations and illustrative score changes, not flood predictions or measured environmental outcomes. Request verification from an authorized maintenance team; do not enter floodwater or drains.</p>
      <details><summary>How ties are resolved</summary><p>Strategy A: highest original score, then larger blockage contribution, then report ID. Strategy B: largest total blockage-score decrease, then higher combined original score, then lower effort, then report IDs.</p></details></div>
    {downloadError && <p role="alert" className="alert">{downloadError}</p>}
    <div className="planning-export"><button type="button" className="primary" disabled={!candidates.length} onClick={download}>Download comparison brief</button><p className="hint">Includes both plans, every effort estimate, selection reasons, and assumptions. Saved observations stay unchanged.</p></div>
  </section>;
}
