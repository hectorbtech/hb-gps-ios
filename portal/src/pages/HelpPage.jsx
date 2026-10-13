import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { copyText } from '../lib/places.js';
import { DETECTION, SMS_BRANDS, TIPS } from '../lib/gpsHelp.js';
import { Badge, Tabs } from '../components/ui.jsx';

const isIp = (value) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(value || ''));

function Copy({ text, label = 'Copiar' }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn small" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1600); } }}>{done ? '✓ Copiado' : label}</button>;
}

// Panel de ayuda: los datos del servidor para configurar un GPS y la referencia de comandos SMS por marca y protocolo.
export default function HelpPage() {
  const [server, setServer] = useState(null);
  const [tab, setTab] = useState('server');
  const [apn, setApn] = useState('');
  const [pass, setPass] = useState('123456');
  const [open, setOpen] = useState('gt06');
  useEffect(() => { api('/api/device-profiles').then((r) => setServer({ host: r.host, port: r.port, profiles: r.data })).catch(() => setServer({ host: '', port: 7700, profiles: [] })); }, []);

  const fill = useMemo(() => (template) => template
    .replaceAll('{host}', server?.host || '{servidor}').replaceAll('{port}', String(server?.port || 7700)).replaceAll('{apn}', apn.trim() || '{APN de la SIM}').replaceAll('{pass}', pass.trim()), [server, apn, pass]);
  const fillCommand = (template) => (template.startsWith('SERVER,0,') && server?.host && !isIp(server.host) ? template.replace('SERVER,0,', 'SERVER,1,') : template);

  const rows = server ? [
    ['Servidor (IP o dominio)', server.host], ['Puerto', String(server.port)], ['Conexión', 'TCP'], ['Protocolo', 'Se detecta solo (GT06, H02 y JT808)'],
    ['Identificador del GPS', 'El IMEI del equipo (15 dígitos): viene en la etiqueta o con STATUS#'], ['Intervalo recomendado', '10 segundos'], ['Zona horaria del equipo', 'GMT-4 (República Dominicana)']
  ] : [];

  return (
    <div className="page help-page">
      <header className="page-head"><div><h2>Ayuda: configurar un GPS</h2><p className="muted">Los datos del servidor y los comandos SMS de cada marca, listos para copiar.</p></div></header>
      <Tabs tabs={[['server', 'Datos del servidor'], ['sms', 'Comandos SMS por marca'], ['tips', 'Problemas comunes']]} value={tab} onChange={setTab} />

      {tab === 'server' && (
        <section className="help-card">
          <p>Todo GPS debe apuntar a este servidor. En cuanto se conecte, aparece solo en <b>Administración → Inventario → GPS detectados</b> con su IMEI y protocolo, y se registra con un clic.</p>
          {!server ? <p className="muted">Cargando…</p> : (
            <table className="table compact"><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td><b>{value}</b></td><td>{['Servidor (IP o dominio)', 'Puerto'].includes(label) && <Copy text={value} />}</td></tr>)}</tbody></table>
          )}
          {server && <div className="callout"><b>Configuración en un solo mensaje (GT06 / Concox):</b><code className="sms">{fill(fillCommand('SERVER,0,{host},{port},0#'))}</code><Copy text={fill(fillCommand('SERVER,0,{host},{port},0#'))} /> <small className="muted">Escribe el APN de la SIM abajo en «Comandos SMS» para ver también ese mensaje.</small></div>}
          <h4>Cómo reconoce el servidor el protocolo</h4>
          <p className="muted">Mira los primeros bytes que manda el equipo al conectarse. No tienes que elegirlo.</p>
          <table className="table compact"><thead><tr><th>Empieza con</th><th>Protocolo</th></tr></thead><tbody>{DETECTION.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody></table>
          <p className="muted">Si un equipo habla otro protocolo, el servidor lo corta y lo deja anotado: avísanos la marca y el modelo para habilitarlo.</p>
        </section>
      )}

      {tab === 'sms' && (
        <section className="help-card">
          <div className="form-grid">
            <label className="field"><span>APN de la SIM</span><input value={apn} onChange={(e) => setApn(e.target.value)} placeholder="Lo da la operadora de la SIM" /><small>Se pone en los comandos de abajo.</small></label>
            <label className="field"><span>Clave del equipo</span><input value={pass} onChange={(e) => setPass(e.target.value)} /><small>De fábrica casi siempre 123456 (Meitrack: 0000).</small></label>
          </div>
          <p className="muted">Envía cada comando por SMS, uno por mensaje, al número de la SIM del GPS. Espera la respuesta antes de mandar el siguiente. Las partes entre llaves ya van rellenadas con el servidor de esta plataforma.</p>
          {SMS_BRANDS.map((brand) => (
            <article key={brand.id} className={`brand${open === brand.id ? ' open' : ''}`}>
              <button type="button" className="brand-head" onClick={() => setOpen(open === brand.id ? '' : brand.id)} aria-expanded={open === brand.id}>
                <span><b>{brand.name}</b><small className="muted block">Protocolo {brand.protocol}</small></span>
                <Badge tone={brand.supported ? 'green' : 'amber'}>{brand.supported ? 'Compatible con este servidor' : 'Aún no habilitado en el servidor'}</Badge>
              </button>
              {open === brand.id && (
                <div className="brand-body">
                  <p>{brand.notes}</p>
                  <table className="table compact"><thead><tr><th>Para</th><th>Mensaje SMS</th><th /></tr></thead>
                    <tbody>{brand.commands.map((c) => {
                      const text = fill(fillCommand(c.sms));
                      return <tr key={c.what}><td>{c.what}{c.unverified ? <small className="warn block">* no figuró en las fuentes consultadas; confírmalo en el manual de tu modelo</small> : null}{c.note && <small className="muted block">{fill(c.note)}</small>}</td><td><code className="sms">{text}</code></td><td><Copy text={text} /></td></tr>;
                    })}</tbody></table>
                  <small className="muted">Fuentes: {brand.sources.map(([label, url], i) => <span key={url}>{i ? ' · ' : ''}<a href={url} target="_blank" rel="noreferrer">{label}</a></span>)}</small>
                </div>
              )}
            </article>
          ))}
          <p className="muted">¿Tu marca no está? La mayoría de los GPS chinos baratos usan el formato de MiCODUS/TK103 o de Concox: prueba con el manual del equipo y revisa que el comando termine igual (con # o con la clave pegada).</p>
        </section>
      )}

      {tab === 'tips' && (
        <section className="help-card">
          {TIPS.map(([title, text]) => <article key={title} className="tip"><b>{title}</b><p>{text}</p></article>)}
        </section>
      )}
    </div>
  );
}
