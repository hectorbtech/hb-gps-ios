import { useEffect, useRef, useState } from 'react';
import { get } from './api.js';

/** Dirección de un punto (con número, sector y lugares cercanos si el mapa los tiene). Se pide una vez por punto; lat nulo = no pedir. */
export function useAddress(lat, lon, { detail = true } = {}) {
  const [state, setState] = useState({ loading: lat != null, line: null, details: null });
  const key = lat == null ? null : `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  const seq = useRef(0);
  useEffect(() => {
    if (!key) { setState({ loading: false, line: null, details: null }); return undefined; }
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    get(`/api/geocode?lat=${lat}&lon=${lon}${detail ? '&detail=1' : ''}`)
      .then((r) => { if (mine === seq.current) setState({ loading: false, line: r.address, details: r.details }); })
      .catch(() => { if (mine === seq.current) setState({ loading: false, line: null, details: null }); });
    return undefined;
  }, [key, detail]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
