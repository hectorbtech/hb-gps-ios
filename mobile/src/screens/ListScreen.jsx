import React, { useMemo, useState } from 'react';
import { deviceName, duration } from '@portal/lib/format.js';
import { useFleet } from '../lib/fleet.jsx';
import { Chip, Icon, TONE, VehicleIcon, groupOf } from '../components/ui.jsx';

const FILTERS = [['all', 'Todos', null], ['moving', 'En marcha', '#16a34a'], ['stopped', 'Detenidos', '#f59e0b'], ['offline', 'Sin señal', '#8a96a8']];

function RightInfo({ device }) {
  const live = device.live;
  const tone = TONE[live.status] || TONE.no_data;
  const since = live.statusSince ? Math.max(0, (Date.now() - new Date(live.statusSince).getTime()) / 1000) : null;
  if (live.status === 'moving') return <div className="rt"><b className={tone.ink}>{Math.round(live.speedKph)} km/h</b><span>ahora</span></div>;
  if (live.status === 'offline') return <div className="rt"><b className={tone.ink}>Sin señal</b><span>{live.at ? `hace ${duration((Date.now() - new Date(live.at).getTime()) / 1000)}` : '—'}</span></div>;
  if (live.status === 'no_data') return <div className="rt"><b className={tone.ink}>Sin datos</b><span>aún</span></div>;
  return <div className="rt"><b className={tone.ink}>{live.status === 'idle' ? 'Ralentí' : 'Detenido'}</b><span>{since != null ? `quieto ${duration(since)}` : ''}</span></div>;
}

export default function ListScreen({ selectedId, onPick }) {
  const { devices, summary, companies, companyId, setCompanyId, me, needsCompany, loaded, tick } = useFleet();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState('');
  void tick;

  const customers = useMemo(() => [...new Map(devices.filter((d) => d.endCustomerId).map((d) => [d.endCustomerId, d.endCustomerName])).entries()], [devices]);
  const counts = useMemo(() => devices.reduce((acc, d) => { const g = groupOf(d.live.status); return { ...acc, [g]: (acc[g] || 0) + 1 }; }, { all: devices.length }), [devices]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices
      .filter((d) => (filter === 'all' || groupOf(d.live.status) === filter) && (!customer || d.endCustomerId === customer))
      .filter((d) => !q || [d.name, d.plate, d.imei, d.driverName, d.vehicleName].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.live.status === b.live.status ? deviceName(a).localeCompare(deviceName(b)) : (a.live.status === 'moving' ? -1 : b.live.status === 'moving' ? 1 : 0)));
  }, [devices, filter, query, customer]);
  void summary;

  return (
    <section className="screen" aria-label="Equipos">
      <div className="head">
        <div className="between"><h1>Equipos</h1><span className="muted" style={{ fontWeight: 700, fontSize: 13 }}>{devices.length} GPS</span></div>
        <label className="field"><Icon name="search" size={19} color="#5b6b82" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar placa, nombre, IMEI o conductor" aria-label="Buscar equipos" /></label>
        <div className="chips">{FILTERS.map(([id, label, dot]) => <Chip key={id} flat on={filter === id} dot={dot} count={counts[id] || 0} onClick={() => setFilter(id)}>{label}</Chip>)}</div>
        {(companies.length > 1 || needsCompany || customers.length > 0) && (
          <div className="row">
            {(companies.length > 1 || needsCompany) && me.role !== 'company_admin' && (
              <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Empresa">{!needsCompany && <option value="">Todas las empresas</option>}{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            )}
            {customers.length > 0 && <select className="select" value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Cliente final"><option value="">Todos los clientes</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
          </div>
        )}
      </div>
      <div className="scroll">
        {rows.map((d) => (
          <button key={d.id} type="button" className={`drow${d.id === selectedId ? ' sel' : ''}`} onClick={() => onPick(d.id)}>
            <VehicleIcon device={d} size="sm" />
            <div className="flex1"><div className="nm ell">{deviceName(d)}</div><div className="sb ell">{[d.plate, d.driverName].filter(Boolean).join(' · ') || d.imei}</div></div>
            <RightInfo device={d} />
          </button>
        ))}
        {loaded && !rows.length && <div className="empty"><b>{devices.length ? 'Nada coincide' : 'Todavía no hay GPS'}</b>{devices.length ? 'Prueba con otro filtro o búsqueda.' : 'Cuando registren un GPS en tu cuenta aparecerá aquí.'}</div>}
      </div>
    </section>
  );
}
