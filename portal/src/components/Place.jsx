import React, { useEffect, useRef, useState } from 'react';
import { get } from '../lib/api.js';
import { copyText, mapLinks } from '../lib/places.js';

const Row = ({ label, children }) => (children ? <div className="kv"><span>{label}</span><b>{children}</b></div> : null);

/** Dirección completa de un punto (con número de casa y lugares cercanos si el mapa los tiene). Se pide una vez por punto. */
export function useAddress(lat, lon, { detail = true } = {}) {
  const [state, setState] = useState({ loading: true, line: null, details: null });
  const key = lat == null ? null : `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  const seq = useRef(0);
  useEffect(() => {
    if (!key) { setState({ loading: false, line: null, details: null }); return; }
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    get(`/api/geocode?lat=${lat}&lon=${lon}${detail ? '&detail=1' : ''}`)
      .then((r) => { if (mine === seq.current) setState({ loading: false, line: r.address, details: r.details }); })
      .catch(() => { if (mine === seq.current) setState({ loading: false, line: null, details: null }); });
  }, [key, detail]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

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
      {d.places?.length > 0 && <div className="kv block"><span>Cerca de aquí</span><ul className="plain compact">{d.places.map((p) => <li key={p.name}><span>{p.name}{p.kind ? <small className="muted"> · {p.kind}</small> : null}</span><small className="muted">{p.distanceM} m</small></li>)}</ul></div>}
    </>
  );
}

/** Acciones sobre un punto: copiar, abrir en otros mapas, cómo llegar, Street View y compartir por WhatsApp. */
export function PlaceActions({ lat, lon, line, name }) {
  const [done, setDone] = useState('');
  const links = mapLinks(lat, lon, line, name);
  const flash = (text) => { setDone(text); setTimeout(() => setDone(''), 2000); };
  const copy = async (text, label) => flash((await copyText(text)) ? `${label} copiado` : 'No se pudo copiar');
  return (
    <div className="place-actions">
      <div className="btn-row">
        <button type="button" className="btn small" onClick={() => copy(line || `${lat}, ${lon}`, 'Dirección')}>⧉ Copiar dirección</button>
        <button type="button" className="btn small" onClick={() => copy(`${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`, 'Coordenadas')}>⧉ Copiar coordenadas</button>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.directions}>➤ Cómo llegar</a>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.streetView}>🏙 Street View</a>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.google}>Google Maps ↗</a>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.waze}>Waze ↗</a>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.osm}>OpenStreetMap ↗</a>
        <a className="btn small" target="_blank" rel="noreferrer" href={links.whatsapp}>Enviar por WhatsApp</a>
      </div>
      {done && <small className="form-ok" role="status">{done}</small>}
    </div>
  );
}
