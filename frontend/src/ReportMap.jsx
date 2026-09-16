import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const COLORS = { High: '#ba452d', Medium: '#b07b12', Low: '#257a51' };
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const BENIN_CITY = [6.335, 5.6037];

function Camera({ reports, selected, reset }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.setView([selected.latitude, selected.longitude], 16, { animate: false });
    else if (reports.length) map.fitBounds(latLngBounds(reports.map(r => [r.latitude, r.longitude])), { padding: [40, 40], maxZoom: 15, animate: false });
    else map.setView(BENIN_CITY, 12, { animate: false });
  }, [map, reports, selected, reset]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function ReportMap({ reports, loading, onRefresh, onPlan }) {
  const [priority, setPriority] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [reset, setReset] = useState(0);
  const [tilesEnabled, setTilesEnabled] = useState(true);
  const [tileError, setTileError] = useState(false);
  const valid = useMemo(() => reports.filter(r => Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 85.05112878 && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180), [reports]);
  const visible = useMemo(() => valid.filter(r => priority === 'All' || r.priority === priority), [valid, priority]);
  const selected = visible.find(r => r.id === selectedId);
  const events = useMemo(() => ({ tileerror: () => setTileError(true) }), []);
  return <section className="panel map-panel">
    <div className="panel-head"><div><p className="eyebrow">FROM OBSERVATIONS TO LOCATIONS</p><h2>Community report map</h2><p className="muted">{visible.length} of {reports.length} loaded reports shown · latest 100 observations</p></div><button className="subtle" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh reports'}</button></div>
    <div className="map-toolbar"><div className="filters" aria-label="Filter map by review priority">{['All', 'High', 'Medium', 'Low'].map(p => <button key={p} aria-pressed={priority === p} className={priority === p ? 'selected' : ''} onClick={() => { setPriority(p); setSelectedId(null); }}>{p}</button>)}</div><button className="subtle" onClick={() => { setSelectedId(null); setReset(n => n + 1); }}>Fit visible reports</button></div>
    <div className="map-legend">{Object.entries(COLORS).map(([p, color]) => <span key={p}><i style={{ background: color }}/>{p} priority</span>)}<label><input type="checkbox" checked={tilesEnabled} onChange={e => setTilesEnabled(e.target.checked)}/> Street background</label></div>
    {tileError && tilesEnabled && <p className="map-warning" role="status">Some street tiles could not load. Report markers and the list remain available. You can turn off the street background to save data.</p>}
    {valid.length !== reports.length && <p className="map-warning">{reports.length - valid.length} report(s) are outside this street map's supported coordinate range. They remain on the dashboard.</p>}
    <div className="map-layout"><div className="map-canvas" aria-label="Interactive map of community observations">
      <MapContainer center={BENIN_CITY} zoom={12} minZoom={2} maxZoom={19} scrollWheelZoom={false}>
        {tilesEnabled && <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} keepBuffer={0} updateWhenIdle={true} updateWhenZooming={false} eventHandlers={events}/>}
        <Camera reports={visible} selected={selected} reset={reset}/>
        {visible.map(r => <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={r.id === selectedId ? 13 : 9} pathOptions={{ color: '#ffffff', weight: 2, fillColor: COLORS[r.priority] || '#527167', fillOpacity: .95 }} eventHandlers={{ click: () => setSelectedId(r.id) }}>
          <Tooltip>{r.location} · {r.priority} · {r.score}/100</Tooltip><Popup><div className="map-popup"><b>{r.location}</b><p>{r.description}</p><span className={`badge ${r.priority.toLowerCase()}`}>{r.priority} review priority · {r.score}/100</span><p>{r.category} · {r.blockage.toLowerCase()} blockage</p><small>Community observation · unverified</small></div></Popup>
        </CircleMarker>)}
      </MapContainer>
    </div><div className="map-list"><h3>Inspect a report</h3><p className="hint">Choose a row or a marker. Reports at the same coordinates can overlap; use this list to inspect each one.</p>
      {visible.length ? visible.map(r => <button className={`map-report ${r.id === selectedId ? 'chosen' : ''}`} key={r.id} aria-pressed={r.id === selectedId} onClick={() => setSelectedId(r.id)}><span className={`badge ${r.priority.toLowerCase()}`}>{r.priority} · {r.score}</span><b>{r.location}</b><small>Report #{r.id} · {r.category}</small></button>) : <p className="empty">{loading ? 'Loading reports…' : 'No reports match this view.'}</p>}
    </div></div>
    {selected && <article className="map-detail"><div><p className="eyebrow">REPORT #{selected.id} · UNVERIFIED</p><h3>{selected.location}</h3><p>{selected.description}</p><p className="hint">Coordinates: {selected.latitude}, {selected.longitude} · Blockage: {selected.blockage} · Standing water: {selected.standing_water ? 'Yes' : 'No'} · Nearby buildings: {selected.nearby_buildings ? 'Yes' : 'No'}</p></div><button className="primary" onClick={onPlan}>Open planning lab</button></article>}
    <p className="hint">Colors indicate review priority, not predicted flood extent. Street tiles need internet access; turning them off keeps the loaded observations visible. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Report a street-map issue</a>.</p>
  </section>;
}
