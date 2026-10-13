import { bearing, haversine } from './places.js';

// Reproducción del historial, compartida por el portal y la app. El vehículo se mueve de forma CONTINUA: en cada cuadro de la animación
// se calcula su lugar exacto entre los dos puntos guardados que lo rodean (nunca salta de punto en punto) y se orienta hacia donde iba.
export const DWELL_MS = 1100;   // al llegar a una parada se avisa un instante y se sigue: nunca se espera el tiempo real que duró
export const DATA_HOLE_S = 300; // un hueco sin datos mayor a esto (5 min) no se anima: no se sabe por dónde fue, se salta

/** Lugar del vehículo a la hora `t` (segundos Unix) dado que está entre los puntos i e i+1. Devuelve [lat, lon, rumbo]. */
export function positionAt(points, i, t, previousHeading = 0) {
  const a = points[i]; const b = points[i + 1];
  if (!a) return null;
  let lat = a[1]; let lon = a[2]; let heading = previousHeading;
  if (b && b[0] > a[0] && b[0] - a[0] <= DATA_HOLE_S) {
    const k = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
    lat = a[1] + (b[1] - a[1]) * k; lon = a[2] + (b[2] - a[2]) * k;
    if (haversine([a[1], a[2]], [b[1], b[2]]) > 4) heading = bearing([a[1], a[2]], [b[1], b[2]]);
  } else if (a[4] != null) heading = a[4];
  return [lat, lon, heading];
}

/** Crea la función que coloca el marcador del mapa (cursorRef lo registra HistoryLayer). */
export function createPlacer(cursorRef) {
  let heading = 0;
  return (points, i, t) => {
    const spot = positionAt(points, i, t, heading);
    if (!spot) return;
    heading = spot[2];
    cursorRef?.current?.(spot[0], spot[1], spot[2]);
  };
}

/**
 * Arranca la reproducción. `stopsSec`: [[inicio, fin], ...] de las paradas en segundos. Devuelve la función que la detiene.
 * onIndex(i) cuando cambia el punto actual; onStop(n|null) al llegar a una parada y 3 s después; onEnd() al terminar el recorrido.
 */
export function runPlayback({ points, stopsSec, multiplier, timeRef, indexRef, onIndex, onStop, onEnd, place }) {
  let last = performance.now();
  let frame;
  let announced = -1;
  let dwellUntil = 0;
  let clearTimer;
  timeRef.current = points[indexRef.current]?.[0] ?? points[0][0];
  const step = (now) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    let t = timeRef.current + dt * multiplier;
    const si = stopsSec.findIndex(([a, b]) => t >= a && t < b);
    if (si >= 0) {
      if (announced !== si) {
        announced = si; dwellUntil = now + DWELL_MS; onStop(si);
        clearTimeout(clearTimer); clearTimer = setTimeout(() => onStop(null), 3200);
      }
      t = now < dwellUntil ? Math.min(t, stopsSec[si][0] + 1) : stopsSec[si][1] + 0.5; // aviso breve y se sigue
    } else {
      const next = points[indexRef.current + 1];
      if (next && next[0] - t > DATA_HOLE_S) t = next[0] - 0.12 * multiplier; // huecos largos sin datos: no se esperan (los normales se recorren a la velocidad real)
    }
    timeRef.current = t;
    let i = indexRef.current;
    while (i < points.length - 1 && points[i + 1][0] <= t) i += 1;
    if (i !== indexRef.current) onIndex(i);
    place(points, i, t);
    if (i >= points.length - 1) { onEnd(); return; }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(frame); clearTimeout(clearTimer); };
}
