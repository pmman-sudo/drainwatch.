import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import Planner from './Planner';
const ReportMap = lazy(() => import('./ReportMap'));

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const blank = { location: '', description: '', category: 'Blocked drain', blockage: 'Partial', standing_water: false, nearby_buildings: false, latitude: '', longitude: '', website: '' };
async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(Array.isArray(body.detail) ? body.detail.map(e => `${e.loc.at(-1)}: ${e.msg}`).join('; ') : typeof body.detail === 'string' ? body.detail : 'The server could not complete this request.');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function App() {
  const [page, setPage] = useState('Dashboard');
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('All');

  async function refresh() {
    setLoading(true); setError('');
    try {
      const [rows, totals] = await Promise.all([api('/reports?limit=100'), api('/stats')]);
      setReports(rows); setStats(totals);
    } catch (e) { setError(`Unable to load reports. Check that the backend is running. ${e.message}`); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  function change(e) {
    const { name, type, value, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const saved = await api('/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, website: form.website || undefined, latitude: Number(form.latitude), longitude: Number(form.longitude) }) });
      setForm(blank); setPage('Dashboard');
      setNotice(`Report #${saved.id} saved. ${saved.priority} review priority (${saved.score}/100).`);
      await refresh();
    } catch (e) {
      setError(e.status && e.status < 500 ? e.message : `Submission not confirmed. Refresh the dashboard before retrying to avoid a duplicate. ${e.message}`);
    }
    finally { setSaving(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError('Location is unavailable. Enter coordinates manually.'); return; }
    navigator.geolocation.getCurrentPosition(p => { setForm(f => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) })); setError(''); },
      () => setError('Could not access your location. You can enter coordinates manually.'), { timeout: 10000 });
  }
  const visible = reports.filter(r => filter === 'All' || r.priority === filter);

  return <div className="shell">
    <aside><a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('Dashboard'); }}><span className="logo">≈</span>DrainWatch</a><p className="aside-label">COMMUNITY RESILIENCE</p>
      <nav>{['Dashboard', 'Submit report', 'Report map', 'Planning lab'].map(p => <button key={p} onClick={() => { setPage(p); setError(''); }} aria-current={page === p ? 'page' : undefined} className={page === p ? 'active' : ''}>{p === 'Dashboard' ? '◫' : p === 'Planning lab' ? '↗' : p === 'Report map' ? '◎' : '+'} <span>{p}</span></button>)}</nav>
      <div className="aside-bottom"><span className="dot"/> Earth Forward<br/><small>Hackathon prototype · v0.1</small></div>
    </aside>
    <main>
      <header><span>WORKSPACE / <b>{page.toUpperCase()}</b></span><span className="pill">Community prototype</span></header>
      <section className="heading"><div><p className="eyebrow">SMALL REPORTS. BETTER PREPARED COMMUNITIES.</p><h1>{page === 'Dashboard' ? 'See the issue. Start the response.' : page === 'Planning lab' ? 'Make limited resources count.' : page === 'Report map' ? 'Put every observation on the map.' : 'What have you noticed?'}</h1><p className="muted">Report blocked drains and standing water to help prioritize local review.</p></div>{page === 'Dashboard' && <button className="primary" onClick={() => setPage('Submit report')}>+ Submit report</button>}</section>
      {error && <div role="alert" className="alert">{error}</div>}
      {notice && <div role="status" className="success">{notice}</div>}
      {page === 'Dashboard' ? <>
        <div className="metrics">{[['Total reports', 'total', 'Community observations'], ['High priority', 'high', 'Review these first'], ['Medium priority', 'medium', 'Follow-up needed'], ['Low priority', 'low', 'Continue monitoring']].map(([label, key, caption]) => <article key={key} className="metric"><p>{label}</p><strong className={key === 'high' ? 'red' : ''}>{stats ? stats[key] : '—'}</strong><small>{caption}</small></article>)}</div>
        <div className="content-grid"><section className="panel"><div className="panel-head"><div><h2>Recent community reports</h2><p className="muted">Latest 100 observations · unverified submissions</p></div><button className="subtle" disabled={loading} onClick={refresh}>{loading ? 'Loading…' : 'Refresh'}</button></div>
          <div className="filters">{['All', 'High', 'Medium', 'Low'].map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
          {loading && !stats ? <p className="empty">Loading your workspace…</p> : visible.length ? <div className="reports">{visible.map(r => <article className="report" key={r.id}><div className="report-title"><h3>{r.location}</h3><span className={`badge ${r.priority.toLowerCase()}`}>{r.priority} · {r.score}</span></div><p>{r.description}</p><div className="report-meta"><span>{r.category}</span><span>#{r.id} · {new Date(r.created_at.endsWith('Z') || /[+-]\d\d:\d\d$/.test(r.created_at) ? r.created_at : `${r.created_at}Z`).toLocaleDateString()}</span></div></article>)}</div> : <div className="empty"><span className="empty-icon">≈</span><h3>{reports.length ? 'No reports in this priority.' : 'Your first report starts here.'}</h3><p>Add an observation to populate this dashboard.</p><button className="primary" onClick={() => setPage('Submit report')}>Create a report</button></div>}
        </section><section className="panel rules"><p className="eyebrow">UNDERSTAND THE SCORE</p><h2>Why this priority?</h2><p>Every score comes from the conditions reported by a person.</p><dl><div><dt>Partial blockage</dt><dd>+25</dd></div><div><dt>Full blockage</dt><dd>+50</dd></div><div><dt>Standing water</dt><dd>+30</dd></div><div><dt>Buildings nearby</dt><dd>+20</dd></div></dl><p className="rule-note">Only one blockage score applies. High: 70–100. Medium: 30–69. Low: 0–29.</p><div className="callout"><b>A starting point for review</b><p>This is a prototype priority score, not a flood forecast or probability. The rules have not been validated against flood outcomes.</p></div></section></div>
      </> : page === 'Report map' ? <Suspense fallback={<div className="panel" role="status">Loading map…</div>}><ReportMap reports={reports} loading={loading} onRefresh={refresh} onPlan={() => setPage('Planning lab')}/></Suspense> : page === 'Planning lab' ? <Planner reports={reports}/> : <form onSubmit={submit} className="panel form"><h2>Community observation</h2><p className="muted">Use a public landmark or street. Avoid personal details or private home addresses.</p>
        <div hidden aria-hidden="true"><label>Leave this field blank<input name="website" value={form.website} onChange={change} tabIndex={-1} autoComplete="off" maxLength={200}/></label></div>
        <label>Location / landmark<input name="location" value={form.location} onChange={change} minLength={3} maxLength={120} placeholder="e.g. public junction, Benin City" required/></label>
        <div className="form-row"><label>Issue type<select name="category" value={form.category} onChange={change}>{['Blocked drain', 'Waste buildup', 'Standing water'].map(v => <option key={v}>{v}</option>)}</select></label><label>Drain blockage<select name="blockage" value={form.blockage} onChange={change}>{['None', 'Partial', 'Full'].map(v => <option key={v}>{v}</option>)}</select></label></div>
        <label>Description<textarea name="description" value={form.description} onChange={change} minLength={10} maxLength={1500} rows={4} required placeholder="Describe what you can see from a safe location."/></label>
        <div className="form-row"><label>Latitude<input type="number" name="latitude" value={form.latitude} onChange={change} step="any" min="-90" max="90" required/></label><label>Longitude<input type="number" name="longitude" value={form.longitude} onChange={change} step="any" min="-180" max="180" required/></label></div>
        <button type="button" className="subtle" onClick={locate}>Use my current location</button><p className="hint">Only use this if you are at the reported public location. Coordinates will be visible to other visitors.</p>
        <label className="check"><input type="checkbox" name="standing_water" checked={form.standing_water} onChange={change}/> Standing water is visible</label><label className="check"><input type="checkbox" name="nearby_buildings" checked={form.nearby_buildings} onChange={change}/> Buildings are near the affected area</label>
        <button className="primary" disabled={saving} type="submit">{saving ? 'Saving report…' : 'Submit observation'}</button>
      </form>}
      <footer>DrainWatch · Report, prioritize, respond. <span>Community reports require verification.</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
