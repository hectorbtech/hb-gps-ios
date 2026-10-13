import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { mapLinks } from '@portal/lib/places.js';

const Row = ({ label, children }) => (children ? <div className="kv"><span>{label}</span><b>{children}</b></div> : null);

/** Calle, número, sector, municipio, provincia, código postal, país y lugares cercanos, cada uno en su fila. */
export function AddressRows({ details, line, loading }) {
  if (!details) return <Row label="Dirección">{line || (loading ? 'Buscando…' : 'El mapa no tiene dirección para este punto')}</Row>;
  const d = details;
  return (
    <>
      <Row label="Dirección">{d.line || line}</Row>
      <Row label="Calle o vía">{d.road}</Row>
      <Row label="Número">{d.houseNumber ? `${d.houseNumber}${d.houseNumberSource === 'cercano' ? ` (el más cercano, a ${d.houseNumberDistanceM} m)` : ''}` : 'Sin número en el mapa'}</Row>
      <Row label="Lugar">{d.placeName}</Row>
      <Row label="Sector o barrio">{[d.neighbourhood, d.suburb].filter(Boolean).join(', ')}</Row>
      <Row label="Municipio o ciudad">{d.city}</Row>
      <Row label="Provincia">{d.state || d.county}</Row>
      <Row label="Código postal">{d.postcode}</Row>
      <Row label="País">{d.country}</Row>
      {d.places?.length > 0 && (
        <div className="kv" style={{ display: 'block' }}><span>Cerca de aquí</span>
          {d.places.map((p) => <div key={p.name} className="row" style={{ justifyContent: 'space-between', padding: '4px 0', fontWeight: 700, fontSize: 13 }}><span className="ell">{p.name}{p.kind ? <small className="muted"> · {p.kind}</small> : null}</span><small className="muted">{p.distanceM} m</small></div>)}
        </div>
      )}
    </>
  );
}

// Acciones sobre un punto: abrir en otros mapas, cómo llegar y compartir por cualquier app del teléfono.
export function PlaceActions({ lat, lon, line, name }) {
  const [done, setDone] = useState('');
  const links = mapLinks(lat, lon, line, name);
  const flash = (text) => { setDone(text); setTimeout(() => setDone(''), 2000); };
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); flash(`${label} copiado`); } catch { flash('No se pudo copiar'); } };
  const share = async () => {
    const text = `${name ? `${name}: ` : ''}${line ? `${line} · ` : ''}https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
    if (Capacitor.isNativePlatform()) { try { await Share.share({ title: name || 'Ubicación', text, dialogTitle: 'Compartir ubicación' }); } catch { /* cancelado */ } } else { window.open(links.whatsapp, '_blank'); }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      <a className="chip flat" href={links.directions} target="_blank" rel="noreferrer">➤ Cómo llegar</a>
      <a className="chip flat" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
      <a className="chip flat" href={links.waze} target="_blank" rel="noreferrer">Waze</a>
      <a className="chip flat" href={links.streetView} target="_blank" rel="noreferrer">Street View</a>
      <button type="button" className="chip flat" onClick={() => copy(line || `${lat}, ${lon}`, 'Dirección')}>Copiar dirección</button>
      <button type="button" className="chip flat" onClick={() => copy(`${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`, 'Coordenadas')}>Copiar coordenadas</button>
      <button type="button" className="chip flat" onClick={share}>Compartir</button>
      {done && <small className="muted" style={{ alignSelf: 'center', fontWeight: 700 }}>{done}</small>}
    </div>
  );
}
