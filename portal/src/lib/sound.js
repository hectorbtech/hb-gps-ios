// Sonido de las alertas del portal. Se genera con el navegador (no hay archivos de audio): una sirena para lo crítico, dos tonos para una
// advertencia y un toque suave para lo informativo. El navegador solo deja sonar tras un toque del usuario en la página; por eso se «desbloquea»
// en el primer clic y a partir de ahí las alertas suenan solas aunque la pestaña esté en segundo plano.
const KEY = 'hbgps.sound';
const DEFAULTS = { enabled: true, level: 'warning', volume: 0.7 }; // level: critical | warning | all

export function soundPrefs() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveSoundPrefs(patch) {
  const next = { ...soundPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento: queda para esta sesión */ }
  return next;
}

let context = null;
let lastAt = 0;
function audio() {
  if (!context) { const Ctor = window.AudioContext || window.webkitAudioContext; if (!Ctor) return null; context = new Ctor(); }
  if (context.state === 'suspended') context.resume().catch(() => undefined);
  return context;
}

/** Se llama en el primer toque del usuario: desde ese momento el navegador permite que las alertas suenen solas. */
export function unlockAudio() {
  const ctx = audio();
  if (!ctx) return;
  const gain = ctx.createGain(); gain.gain.value = 0.0001;
  const osc = ctx.createOscillator(); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.02);
}

// Cada patrón: lista de [frecuencia Hz, inicio s, duración s, tipo de onda]
const PATTERNS = {
  critical: [...Array.from({ length: 4 }, (_, i) => [[880, i * 0.62, 0.3, 'square'], [622, i * 0.62 + 0.3, 0.3, 'square']]).flat()],
  warning: [[740, 0, 0.18, 'triangle'], [740, 0.28, 0.18, 'triangle'], [988, 0.56, 0.26, 'triangle']],
  info: [[587, 0, 0.14, 'sine'], [784, 0.16, 0.18, 'sine']]
};

/** ¿Debe sonar una alerta de esta gravedad según lo que eligió el usuario? */
export function shouldSound(severity, prefs = soundPrefs()) {
  if (!prefs.enabled) return false;
  if (prefs.level === 'all') return true;
  if (prefs.level === 'critical') return severity === 'critical';
  return severity === 'critical' || severity === 'warning';
}

/** Hace sonar la alerta. `force` ignora la preferencia (botón «Probar sonido»). Evita repetirse si llegan varias juntas. */
export function playAlert(severity = 'warning', { force = false } = {}) {
  const prefs = soundPrefs();
  if (!force && !shouldSound(severity, prefs)) return false;
  const nowMs = Date.now();
  if (!force && nowMs - lastAt < 2500) return false;
  const ctx = audio();
  if (!ctx) return false;
  lastAt = nowMs;
  const pattern = PATTERNS[severity] || PATTERNS.warning;
  const peak = Math.max(0.05, Math.min(1, prefs.volume)) * 0.35;
  const start = ctx.currentTime + 0.02;
  for (const [freq, at, length, type] of pattern) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(peak, start + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start + at); osc.stop(start + at + length + 0.02);
  }
  return true;
}
