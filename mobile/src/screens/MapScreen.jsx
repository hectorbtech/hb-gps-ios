import React, { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { DeviceLayer, MapView, useMap } from '@portal/components/map.jsx';
import { deviceName, kph } from '@portal/lib/format.js';
import { get, qs } from '../lib/api.js';
import { useFleet } from '../lib/fleet.jsx';
import { useAddress } from '../lib/address.js';
import { Chip, Icon, TONE, VehicleIcon, ageLabel, groupOf } from '../components/ui.jsx';

// Botones flotantes dentro del mapa: ver toda la flota y seguir al GPS elegido.
function Fabs({ devices, follow, setFollow, hasSelected }) {
  const map = useMap();
  const fit = () => {
    const pts = devices.filter((d) => d.live.lat != null).map((d) => [d.live.lat, d.live.lon]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 15 });
  };
  return (
    <div className="fabs" style={{ bottom: hasSelected ? 'calc(100% - 55%)' : 96 }}>
      <button type="button" className="fab" aria-label="Ver todos los GPS" onClick={fit}><Icon name="fit" /></button>
      {hasSelected && <button type="button" className={`fab${follow ? ' on' : ''}`} aria-label="Seguir al GPS" aria-pressed={follow} onClick={() => setFollow(!follow)}><Icon name="locate" color={follow ? '#fff' : '#0b1f3a'} /></button>}
    </div>
  );
}

const FILTERS = [['all', 'Todos', null], ['moving', 'En marcha', '#16a34a'], ['stopped', 'Detenidos', '#f59e0b'], ['offline', 'Sin señal', '#8a96a8']];

export default function MapScreen({ selectedId, onSelect, onAlerts, onDetail, onHistory, onCommands }) {
  const { devices, byId, unread, connection, loaded, needsCompany, companyId, trails, seedTrail } = useFleet();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(false);
  const selected = selectedId ? byId.get(selectedId) : null;
  // Al elegir un GPS se dibuja por dónde ha ido en la última hora; desde ahí la estela sigue creciendo con cada punto en vivo.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    get(`/api/devices/${selectedId}/history${qs({ from: new Date(Date.now() - 3600_000).toISOString(), to: new Date().toISOString(), maxPoints: 400 })}`)
      .then((result) => { if (!cancelled) seedTrail(selectedId, (result?.points || []).map((p) => [p[1], p[2], p[0] * 1000])); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedId, seedTrail]);

  const counts = useMemo(() => devices.reduce((acc, d) => { const g = groupOf(d.live.status); return { ...acc, all: acc.all + 1, [g]: (acc[g] || 0) + 1 }; }, { all: 0 }), [devices]);
  const visible = useMemo(() => devices.filter((d) => filter === 'all' || groupOf(d.live.status) === filter), [devices, filter]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return devices.filter((d) => [d.name, d.plate, d.imei, d.driverName, d.vehicleName].some((v) => String(v || '').toLowerCase().includes(q))).slice(0, 6);
  }, [devices, query]);

  return (
    <section className="screen" aria-label="Mapa en vivo">
      <div className="mapwrap">
        <MapView center={[18.7, -70.2]} zoom={8}>
          <DeviceLayer devices={visible} selectedId={selectedId} onSelect={(id) => { onSelect(id); setQuery(''); }} follow={follow} trails={trails} />
          <Fabs devices={visible} follow={follow} setFollow={setFollow} hasSelected={Boolean(selected)} />
        </MapView>
      </div>

      <div className="top">
        <div className="searchbar">
          <Icon name="search" size={20} color="#5b6b82" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar placa, nombre o IMEI" aria-label="Buscar un GPS" />
          {query && <button type="button" className="iconbtn" aria-label="Borrar búsqueda" onClick={() => setQuery('')}><Icon name="close" size={18} /></button>}
          <button type="button" className="iconbtn" aria-label="Notificaciones" onClick={onAlerts}><Icon name="bell" size={20} color="#0b1f3a" />{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}</button>
        </div>
        {results.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(11,31,58,.18)', overflow: 'hidden' }}>
            {results.map((d) => <button key={d.id} type="button" className="drow" onClick={() => { onSelect(d.id); setQuery(''); }}><VehicleIcon device={d} size="sm" /><div className="flex1"><div className="nm ell">{deviceName(d)}</div><div className="sb ell">{[d.plate, d.driverName].filter(Boolean).join(' · ') || d.imei}</div></div></button>)}
          </div>
        )}
        <div className="chips" role="tablist" aria-label="Filtrar por estado">
          {FILTERS.map(([id, label, dot]) => <Chip key={id} on={filter === id} dot={dot} count={counts[id] || 0} onClick={() => setFilter(id)}>{label}</Chip>)}
        </div>
      </div>

      {!loaded && <div className="conn" style={{ bottom: selected ? '56%' : 96 }}>Cargando flota…</div>}
      {loaded && devices.length === 0 && <div className="empty" style={{ position: 'absolute', left: 16, right: 16, top: '38%', zIndex: 500, background: '#fff', borderRadius: 18, boxShadow: '0 4px 16px rgba(11,31,58,.18)', padding: 24 }}><b>{needsCompany && !companyId ? 'Elige una empresa' : 'Todavía no hay GPS'}</b>{needsCompany && !companyId ? 'En Cuenta puedes elegir la empresa.' : 'Cuando registren un GPS en tu cuenta aparecerá aquí.'}</div>}
      {loaded && <div className={`conn${connection === 'live' ? '' : ' bad'}`} style={{ bottom: selected ? 'calc(56% + 8px)' : 96, left: 12 }}><i />{connection === 'live' ? 'En vivo' : 'Reconectando…'}</div>}

      {selected && <SelectedSheet device={selected} onClose={() => { onSelect(null); setFollow(false); }} onDetail={onDetail} onHistory={onHistory} onCommands={onCommands} />}
    </section>
  );
}

function SelectedSheet({ device, onClose, onDetail, onHistory, onCommands }) {
  const live = device.live;
  const tone = TONE[live.status] || TONE.no_data;
  const addr = useAddress(live.address ? null : live.lat, live.lon, { detail: false });
  return (
    <div className="sheet" role="region" aria-label={`Resumen de ${deviceName(device)}`}>
      <button type="button" className="grab" aria-label="Cerrar resumen" onClick={onClose} style={{ border: 0, padding: 0, height: 5 }} />
      <div className="row">
        <VehicleIcon device={device} />
        <div className="flex1"><div className="nm ell">{deviceName(device)}</div><div className="sb ell">{[device.plate, device.driverName].filter(Boolean).join(' · ') || device.imei}</div></div>
        <div className="speed"><b className={tone.ink}>{live.status === 'moving' ? Math.round(live.speedKph) : tone.label.split(' ')[0]}</b><span>{live.status === 'moving' ? 'km/h' : ageLabel(live.statusSince)}</span></div>
      </div>
      <div className="stats">
        <div className="stat"><b>{live.voltage != null ? `${Number(live.voltage).toFixed(1)} V` : '—'}</b><span>voltaje vehículo</span></div>
        <div className="stat"><b>{live.battery != null ? `${Math.round(live.battery)} %` : '—'}</b><span>batería GPS</span></div>
        <div className="stat"><b>{ageLabel(live.at).replace('hace ', 'hace ')}</b><span>último dato</span></div>
      </div>
      <div className="addr"><Icon name="pin" size={16} color="#5b6b82" /><span className="ell">{live.address || addr.line || (addr.loading ? 'Buscando dirección…' : 'Sin dirección todavía')}</span></div>
      <div className="actions">
        <button type="button" className="act p" onClick={() => onDetail(device.id)}>Detalles</button>
        <button type="button" className="act" onClick={() => onHistory(device.id)}><Icon name="clock" size={17} />Historial</button>
        <button type="button" className="act" onClick={() => onCommands(device.id)}><Icon name="power" size={17} />Comandos</button>
      </div>
    </div>
  );
}
