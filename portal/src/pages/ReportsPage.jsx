import React, { useCallback, useEffect, useState } from 'react';
import { explain, get, qs } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { duration, km, kph, localInput, startOfDay } from '../lib/format.js';
import { Empty } from '../components/ui.jsx';

const PRESETS = [['Hoy', () => [startOfDay(0), new Date()]], ['Ayer', () => [startOfDay(-1), startOfDay(0)]], ['7 días', () => [startOfDay(-6), new Date()]], ['30 días', () => [startOfDay(-29), new Date()]]];

export default function ReportsPage() {
  const { companyId, selectedId, select } = useFleet();
  const [range, setRange] = useState(() => PRESETS[2][1]());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('distanceKm');

  const load = useCallback(async (from, to) => {
    setBusy(true); setError('');
    try { setData(await get(`/api/reports/fleet${qs({ from: from.toISOString(), to: to.toISOString(), companyId })}`)); } catch (err) { setError(explain(err)); setData(null); } finally { setBusy(false); }
  }, [companyId]);
  useEffect(() => { load(...range); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (from, to) => { setRange([from, to]); load(from, to); };
  const csv = `/api/reports/fleet${qs({ from: range[0].toISOString(), to: range[1].toISOString(), companyId, format: 'csv' })}`;
  const rows = [...(data?.devices || [])].sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
  const top = rows[0];
  const th = (key, label) => <th><button type="button" className={`sort${sort === key ? ' on' : ''}`} onClick={() => setSort(key)}>{label}{sort === key ? ' ▾' : ''}</button></th>;

  return (
    <div className="page">
      <div className="filters">
        <div className="chips">{PRESETS.map(([label, fn]) => <button type="button" className="chip" key={label} onClick={() => { const [a, b] = fn(); apply(a, b); }}>{label}</button>)}</div>
        <label>Desde<input type="datetime-local" value={localInput(range[0])} onChange={(e) => setRange([new Date(e.target.value), range[1]])} /></label>
        <label>Hasta<input type="datetime-local" value={localInput(range[1])} onChange={(e) => setRange([range[0], new Date(e.target.value)])} /></label>
        <button type="button" className="btn primary" disabled={busy} onClick={() => load(...range)}>{busy ? 'Calculando…' : 'Ver reporte'}</button>
        {data && <a className="btn" href={csv} download>⬇ Descargar CSV</a>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {data && (
        <>
          <div className="kpis">
            <div><b>{km(data.totals.distanceKm)}</b><small>recorridos por la flota</small></div>
            <div><b>{data.totals.devices}</b><small>GPS en el reporte</small></div>
            <div><b>{data.totals.alerts}</b><small>alertas del periodo</small></div>
            <div><b>{top && top.distanceKm > 0 ? top.name : '—'}</b><small>el que más recorrió</small></div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>GPS</th>{th('distanceKm', 'Distancia')}{th('maxSpeedKph', 'Velocidad máx.')}{th('movingSeconds', 'En movimiento')}{th('idleSeconds', 'Ralentí')}{th('alerts', 'Alertas')}</tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => { select(d.id); window.location.hash = '#/live'; }}>
                    <td><b>{d.name}</b><small className="muted block">{d.plate || d.imei}</small></td>
                    <td>{km(d.distanceKm)}</td><td>{kph(d.maxSpeedKph)}</td><td>{duration(d.movingSeconds)}</td><td>{duration(d.idleSeconds)}</td>
                    <td>{d.alerts > 0 ? <span className="badge amber">{d.alerts}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty icon="📊" title="Sin datos en este periodo" />}
          </div>
        </>
      )}
    </div>
  );
}
