import React, { useEffect, useMemo, useState } from 'react';
import { get, qs } from '../lib/api.js';

export const PLAN_NAMES = { 'basic:annual': 'Básico · 1 año', 'basic:lifetime': 'Básico · vitalicio', 'plus:annual': 'Plus · 1 año', 'plus:lifetime': 'Plus · vitalicio' };
export const planName = (plan, term) => PLAN_NAMES[`${plan}:${term}`] || `${plan} ${term}`;
const FALLBACK = [{ plan_code: 'basic', term: 'annual', credits: 1, whatsapp_messages: 0, whatsapp_months: 0 }, { plan_code: 'basic', term: 'lifetime', credits: 1.8, whatsapp_messages: 0, whatsapp_months: 0 }, { plan_code: 'plus', term: 'annual', credits: 1.8, whatsapp_messages: 192, whatsapp_months: 12 }, { plan_code: 'plus', term: 'lifetime', credits: 3, whatsapp_messages: 312, whatsapp_months: 24 }];
export const planIncludes = (p) => (p.plan_code === 'plus' ? `Todo lo del Básico + avisos por WhatsApp (${p.whatsapp_messages} mensajes${p.whatsapp_months ? ` durante ${p.whatsapp_months} meses` : ''})` : 'Rastreo en vivo, historial, geovallas, rutas seguras, alertas en el portal y la app, comandos y compartir ubicación');

/** Elige el plan de un GPS y muestra cuántos créditos cuesta frente al saldo de la empresa; sin saldo, permite dejarlo pendiente. */
export default function PlanPicker({ companyId, value, allowPending, free = false, onChange, primary = false, canWaive = false }) {
  const [catalog, setCatalog] = useState(FALLBACK);
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    get('/api/license-catalog').then((rows) => rows?.length && setCatalog(rows)).catch(() => undefined);
    get(`/api/credits${qs({ companyId })}`).then((c) => setBalance(Number(c.wallet.balance))).catch(() => undefined);
  }, [companyId]);
  const options = useMemo(() => ['basic:annual', 'basic:lifetime', 'plus:annual', 'plus:lifetime'].map((id) => catalog.find((p) => `${p.plan_code}:${p.term}` === id)).filter(Boolean), [catalog]);
  const chosen = options.find((p) => `${p.plan_code}:${p.term}` === value);
  const waived = primary || free; // empresa principal o cortesía: sin créditos
  const short = !waived && chosen && balance != null && Number(chosen.credits) > balance;
  return (
    <div className="plan-pick wide">
      {options.map((p) => {
        const id = `${p.plan_code}:${p.term}`;
        return (
          <label key={id} className={`plan-card${value === id ? ' on' : ''}`}>
            <input type="radio" name="plan" checked={value === id} onChange={() => onChange({ plan: id, allowPending, free })} />
            <span className="plan-head"><b>{PLAN_NAMES[id]}</b><em>{waived ? 'Sin cargo' : `${Number(p.credits).toLocaleString('es-DO')} ${Number(p.credits) === 1 ? 'crédito' : 'créditos'}`}</em></span>
            <small>{planIncludes(p)}</small>
          </label>
        );
      })}
      {primary && <p className="hint"><b>Empresa principal:</b> sus GPS no usan créditos. Elige solo el plan (define lo que incluye).</p>}
      {!primary && canWaive && <label className="check"><input type="checkbox" checked={Boolean(free)} onChange={(e) => onChange({ plan: value, allowPending, free: e.target.checked })} /> <span><b>Sin cargo</b> (cortesía de la plataforma: no se descuentan créditos a la empresa)</span></label>}
      {!waived && <p className="hint">{balance == null ? '' : <>Tus créditos: <b className={balance < 0 ? 'bad' : ''}>{balance.toLocaleString('es-DO')}</b>. {chosen ? (short ? <span className="bad">No alcanzan para este plan.</span> : <>Después quedarán {(balance - Number(chosen.credits)).toLocaleString('es-DO')}.</>) : 'Se descuentan al confirmar.'}</>}</p>}
      {short && <label className="check danger-check on"><input type="checkbox" checked={Boolean(allowPending)} onChange={(e) => onChange({ plan: value, allowPending: e.target.checked, free })} /> <b>Dejarlo pendiente hasta recargar créditos</b><small>El GPS queda registrado, con rastreo en vivo básico, y el plan se activa solo cuando se recargue tu saldo. Si no lo marcas, no se registra nada.</small></label>}
    </div>
  );
}
