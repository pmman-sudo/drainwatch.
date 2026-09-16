import { useState } from 'react';

export default function Planner({ reports }) {
  const [capacity, setCapacity] = useState(3);
  // Equal effort assumption; highest removable blockage contribution first.
  const ranked = reports.filter(r => r.blockage !== 'None').map(r => ({ ...r, reduction: r.blockage === 'Full' ? 50 : 25 }))
    .sort((a, b) => b.reduction - a.reduction || b.score - a.score || a.id - b.id);
  const selected = ranked.slice(0, capacity);
  const savedPoints = selected.reduce((total, r) => total + r.reduction, 0);
  function brief() {
    const lines = ['DRAINWATCH — SCENARIO BRIEF', `Generated: ${new Date().toISOString()}`, '',
      'Illustrative planning exercise using the latest 100 reports. Reports are unverified.',
      'Assumes each report is a distinct site, equal effort per site, and complete removal of its blockage.',
      'Standing water and nearby-building flags remain unchanged. Score changes are not measured flood reductions.', '',
      ...selected.map((r, i) => `${i + 1}. ${r.location} (#${r.id})\n   Coordinates: ${r.latitude}, ${r.longitude}\n   Reported: ${r.blockage} blockage. Score ${r.score} -> ${r.score - r.reduction}.\n   First step: ask an authorized maintenance team to verify the report and assess safe access.`), '',
      `Total illustrative score decrease: ${savedPoints} points across ${selected.length} reports.`,
      'Do not enter floodwater or drains. This is a review list for qualified responders, not a fieldwork instruction.'];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'drainwatch-scenario-brief.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel form"><p className="eyebrow">WHAT IF WE COULD ADDRESS THREE SITES?</p><h2>Cleanup planning lab</h2>
    <p className="muted">Compare a hypothetical cleanup using the latest 100 reports. Your saved observations remain unchanged.</p>
    <label>Number of sites to consider: {capacity}<input aria-label="Number of sites" type="range" min="1" max="10" value={capacity} onChange={e => setCapacity(Number(e.target.value))}/></label>
    <div className="callout"><b>{selected.length} candidate sites · {savedPoints} score points potentially removed</b><p>Assumes equal effort and full blockage removal at each distinct site. This is an illustrative rule-based scenario, not an estimate of floods prevented.</p></div>
    {selected.length ? selected.map(r => <article className="report" key={r.id}><div className="report-title"><h3>{r.location}</h3><span className="badge low">{r.score} → {r.score - r.reduction}</span></div><p>{r.blockage} blockage · {r.description}</p><small>Verify the observation and refer to an authorized maintenance team.</small></article>) : <p className="empty">Add a report with partial or full drain blockage to try a scenario.</p>}
    <button className="primary" disabled={!selected.length} onClick={brief}>Download scenario brief</button>
    <p className="hint">Candidate ranking: largest blockage score contribution, then highest total score. Travel, effort, duplicates, rainfall, and verified outcomes are not yet modeled.</p>
  </section>;
}
