import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { STATUS, ago, deviceName, kph } from '../lib/format.js';
import { DeviceLayer, FitButton, FitTo, HistoryLayer, MapView, ZonesLayer } from '../components/map.jsx';
import { DeviceIcon, Empty, StatusDot } from '../components/ui.jsx';
import DeviceDetail from '../components/DeviceDetail.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';

const FILTERS = [['all', 'Todos'], ['moving', 'En movimiento'], ['idle', 'Ralentí'], ['stopped', 'Detenidos'], ['offline', 'Sin señal']];

export default function LivePage() {
  const fleet = useFleet();
  const { devices, summary, selectedId, select, loaded, connection, me, companyId } = fleet;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [follow, setFollow] = useState(false);
  const [isolate, setIsolate] = useState(false); // por defecto todos los GPS del cliente se ven igual; el elegido solo gana prioridad
  const [showZones, setShowZones] = useState(true);
  const [history, setHistory] = useState(false);
  const [track, setTrack] = useState(null);
  const [playIndex, setPlayIndex] = useState(0);
  const cursorRef = useRef(null); // el reproductor del historial mueve el marcador directo (cuadro a cuadro), sin pasar por React
  const [selection, setSelection] = useState(null); // parada o viaje elegido en el historial
  const [focus, setFocus] = useState({ bounds: null, token: 0 });
  const [zones, setZones] = useState({ geofences: [], routes: [] });
  const [scope, setScope] = useState('all'); // all | primary | inventory | c:<empresa>
  const [customerFilter, setCustomerFilter] = useState('');
  const [sheet, setSheet] = useState(false); // lista desplegada en móvil
  const [minimized, setMinimized] = useState(false); // el panel de detalle se puede minimizar sin soltar el GPS elegido
  const [listHidden, setListHidden] = useState(false); // en escritorio, ocultar la lista deja todo el ancho al mapa

  useEffect(() => {
    const q = companyId ? `?companyId=${companyId}` : '';
    Promise.all([get(`/api/geofences${q}`), get(`/api/routes${q}`)]).then(([geofences, routes]) => setZones({ geofences, routes })).catch(() => undefined);
  }, [companyId]);

  const selected = fleet.byId.get(selectedId) || null;
  const multiCompany = me.role === 'platform_admin' || me.role === 'reseller_admin';

  // Filtros del mapa y de la lista: toda la plataforma, mi empresa principal, sin asignar (inventario), una empresa o un cliente final.
  const companiesInFleet = useMemo(() => {
    const map = new Map();
    for (const d of devices) if (!d.companyIsInventory) { const c = map.get(d.companyId) || { id: d.companyId, name: d.companyName, primary: d.companyIsPrimary, count: 0 }; c.count += 1; map.set(d.companyId, c); }
    return [...map.values()].sort((a, b) => Number(b.primary) - Number(a.primary) || String(a.name).localeCompare(String(b.name)));
  }, [devices]);
  const primary = companiesInFleet.find((c) => c.primary);
  const inventoryCount = devices.filter((d) => d.companyIsInventory).length;
  const customers = useMemo(() => {
    const map = new Map();
    for (const d of devices) if (d.endCustomerId && (scope === 'all' || (scope === 'primary' ? d.companyIsPrimary : scope === 'inventory' ? d.companyIsInventory : `c:${d.companyId}` === scope))) map.set(d.endCustomerId, d.endCustomerName);
    return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [devices, scope]);
  const scoped = useMemo(() => devices.filter((d) => (scope === 'all' || (scope === 'primary' ? d.companyIsPrimary : scope === 'inventory' ? d.companyIsInventory : `c:${d.companyId}` === scope)) && (!customerFilter || d.endCustomerId === customerFilter)), [devices, scope, customerFilter]);
  const shown = useMemo(() => (selectedId && fleet.byId.get(selectedId) && !scoped.some((d) => d.id === selectedId) ? [...scoped, fleet.byId.get(selectedId)] : scoped), [scoped, selectedId, fleet.byId]);
  const counts = useMemo(() => shown.reduce((acc, d) => ({ ...acc, [d.live.status]: (acc[d.live.status] || 0) + 1 }), { total: shown.length }), [shown]);
  useEffect(() => {
    const points = scoped.filter((d) => d.live.lat != null).map((d) => [d.live.lat, d.live.lon]);
    if (points.length && (scope !== 'all' || customerFilter)) setFocus((f) => ({ bounds: points, token: f.token + 1 }));
  }, [scope, customerFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCustomerFilter(''); }, [scope]);
  useEffect(() => { setHistory(false); setTrack(null); setFollow(false); setSelection(null); }, [selectedId]);
  // Al elegir un GPS se dibuja por dónde ha ido en la última hora (y desde ahí sigue creciendo con cada punto en vivo).
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    const from = new Date(Date.now() - 60 * 60_000).toISOString();
    get(`/api/devices/${selectedId}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}&maxPoints=400`).then((result) => {
      if (!cancelled) fleet.seedTrail(selectedId, (result?.points || []).map((p) => [p[1], p[2], p[0] * 1000]));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shown.filter((d) => (filter === 'all' || d.live.status === filter) && (!q || [d.name, d.plate, d.imei, d.vehicleName, d.driverName, d.endCustomerName].filter(Boolean).join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (STATUS[a.live.status]?.order ?? 9) - (STATUS[b.live.status]?.order ?? 9) || deviceName(a).localeCompare(deviceName(b)));
  }, [shown, query, filter, fleet.tick]);

  const onFocus = useCallback((points) => setFocus((f) => ({ bounds: points, token: f.token + 1 })), []);
  const onTrack = useCallback((value) => setTrack(value), []);

  return (
    <div className={`live${selected && !history ? ' has-detail' : ''}${minimized ? ' detail-min' : ''}${sheet ? ' sheet-open' : ''}${listHidden ? ' list-hidden' : ''}`}>
      <section className="fleet-list" aria-label="Lista de GPS">
        <div className="list-head">
          {(multiCompany || customers.length > 0) && (
            <div className="scope-pick">
              {multiCompany && (
                <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Ver GPS de">
                  <option value="all">{me.role === 'platform_admin' ? 'Toda la plataforma' : 'Todas mis empresas'} ({devices.length})</option>
                  {primary && <option value="primary">⭐ Mi empresa · {primary.name} ({primary.count})</option>}
                  {me.role === 'platform_admin' && inventoryCount > 0 && <option value="inventory">Sin asignar · inventario ({inventoryCount})</option>}
                  <optgroup label="Por empresa">{companiesInFleet.filter((c) => !c.primary).map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name} ({c.count})</option>)}</optgroup>
                </select>
              )}
              {customers.length > 0 && me.role !== 'end_customer' && (
                <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} aria-label="Cliente final">
                  <option value="">Todos los clientes finales</option>
                  {customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
            </div>
          )}
          <input type="search" placeholder="Buscar nombre, placa, IMEI o conductor…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar GPS" />
          <div className="chips">{FILTERS.map(([id, label]) => <button type="button" key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{label}<em>{id === 'all' ? counts.total || 0 : counts[id] || 0}</em></button>)}</div>
        </div>
        <ul className="dev-list">
          {filtered.map((d) => (
            <li key={d.id}>
              <button type="button" className={`dev-row${d.id === selectedId ? ' sel' : ''}`} onClick={() => { select(d.id); setSheet(false); }}>
                <StatusDot status={d.live.status} /><DeviceIcon device={d} />
                <span className="dev-main"><b>{deviceName(d)}</b><small>{[d.plate, d.driverName].filter(Boolean).join(' · ') || d.imei}{multiCompany && !d.companyIsInventory ? ` · ${d.companyName}` : ''}{d.companyIsInventory ? ' · inventario' : ''}</small></span>
                <span className="dev-side"><b>{d.live.status === 'moving' ? kph(d.live.speedKph) : (STATUS[d.live.status]?.label || '').split(',')[0]}</b><small title={d.live.status === 'moving' ? 'Último dato' : 'Desde el último movimiento'}>{d.live.status === 'moving' ? 'ahora' : ['idle', 'stopped'].includes(d.live.status) ? (d.live.statusSince ? `quieto ${ago(d.live.statusSince).replace('hace ', '')}` : 'sin movimiento') : ago(d.live.at)}</small></span>
              </button>
            </li>
          ))}
          {loaded && filtered.length === 0 && <Empty icon="🛰️" title={devices.length ? 'Ningún GPS coincide' : 'Aún no hay GPS'}>{devices.length ? 'Cambia el filtro o la búsqueda.' : 'Cuando se registre el primer equipo aparecerá aquí.'}</Empty>}
          {!loaded && <li className="muted pad">Cargando flota…</li>}
        </ul>
      </section>

      <section className="map-area">
        <MapView onClick={() => undefined}>
          <DeviceLayer devices={shown} selectedId={history ? null : selectedId} onSelect={select} follow={follow && !history} isolate={isolate && !history} trails={history ? null : fleet.trails} />
          {showZones && <ZonesLayer geofences={zones.geofences} routes={zones.routes} />}
          {history && track?.points?.length > 0 && <HistoryLayer points={track.points} stops={track.stops} index={playIndex} device={selected} selection={selection} cursorRef={cursorRef} onPickStop={(i) => setSelection({ kind: 'stop', i })} />}
          {focus.bounds && <FitTo bounds={focus.bounds} token={focus.token} />}
          <div className="map-tools">
            <button type="button" className={`map-btn list-toggle${listHidden ? '' : ' on'}`} onClick={() => setListHidden(!listHidden)} title="Mostrar u ocultar la lista de GPS">☰ Lista</button>
            <FitButton devices={shown} />
            <button type="button" className={`map-btn${showZones ? ' on' : ''}`} onClick={() => setShowZones(!showZones)}>▭ Zonas y rutas</button>
            <button type="button" className={`map-btn${isolate ? ' on' : ''}`} onClick={() => setIsolate(!isolate)} title="Opcional: baja la intensidad de los demás GPS cuando hay uno elegido">◉ Atenuar los demás</button>
          </div>
          <div className={`conn c-${connection}`} title="Estado del enlace en vivo">{connection === 'live' ? '● En vivo' : connection === 'connecting' ? '… Conectando' : '○ Reconectando'}</div>
        </MapView>
        <button type="button" className="sheet-toggle" onClick={() => setSheet(!sheet)}>☰ {summary.total || 0} GPS</button>
        {history && selected && <HistoryPanel device={selected} onData={onTrack} index={playIndex} onIndex={setPlayIndex} selection={selection} onSelection={setSelection} onFocus={onFocus} cursorRef={cursorRef} onClose={() => { setHistory(false); setTrack(null); setSelection(null); }} />}
      </section>

      {selected && !history && <DeviceDetail device={selected} me={me} follow={follow} onFollow={setFollow} onHistory={() => setHistory(true)} onClose={() => select(null)} onChanged={fleet.refresh} minimized={minimized} onMinimize={setMinimized} />}
    </div>
  );
}
