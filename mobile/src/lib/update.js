import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { get, getServerBase, isNative } from './api.js';

// iPhone: solo actualiza el App Store. No hay plugin de actualizacion propio ni descarga de instaladores.
export const isIos = Capacitor.getPlatform() === 'ios';

// Plugin propio de la app (HbgpsUpdatePlugin.java). Dos canales de distribución:
//  · direct: APK propia; la app descarga la APK del servidor y abre el instalador de Android.
//  · play:   Google Play; la actualiza Google Play (API de actualizaciones dentro de la app). No se instala ninguna APK por fuera.
const Native = isNative && !isIos ? registerPlugin('HbgpsUpdate') : null;
let channelCache = null;

export async function updateChannel() {
  if (isIos) return 'appstore';
  if (!Native) return 'web';
  if (!channelCache) { try { channelCache = (await Native.getChannel()).channel; } catch { channelCache = 'direct'; } }
  return channelCache;
}

export async function appVersion() {
  if (isIos) { try { const info = await CapApp.getInfo(); return { version: info.version, versionCode: Number(info.build) || 0 }; } catch { return { version: '', versionCode: 0 }; } }
  if (!Native) return { version: 'web', versionCode: 0 };
  const info = await Native.getVersion();
  return { version: info.version, versionCode: Number(info.versionCode) || 0 };
}

/** Pregunta si hay una versión más nueva que la instalada (al servidor propio o a Google Play, según el canal). */
export async function checkUpdate() {
  if (!isNative || isIos) return { available: false };
  const [channel, local] = await Promise.all([updateChannel(), appVersion()]);
  if (channel === 'play') {
    const play = await Native.playCheck();
    if (!play.available) return { available: false, current: local.version };
    // Prioridad 4-5 (se fija al publicar en Play Console) = obligatoria: actualización inmediata que bloquea la app.
    return { available: true, channel, current: local.version, versionName: '', notes: '', mandatory: play.priority >= 4, immediate: play.immediate, flexible: play.flexible, downloaded: play.downloaded };
  }
  const remote = await get('/api/app/android');
  if (!remote.available || remote.versionCode <= local.versionCode) return { available: false, current: local.version };
  return { available: true, channel, current: local.version, versionName: remote.versionName, versionCode: remote.versionCode, notes: remote.notes, sizeBytes: remote.sizeBytes, mandatory: local.versionCode < (remote.minVersionCode || 0), url: `${getServerBase()}${remote.url}` };
}

/** Canal direct: descarga (avisando el avance) y abre el instalador. Lanza 'INSTALL_PERMISSION_REQUIRED' si falta permitir instalar desde esta app. */
export async function downloadAndInstall(update, onProgress) {
  const sub = await Native.addListener('progress', (event) => onProgress?.(event.percent));
  try { await Native.download({ url: update.url }); } finally { sub.remove(); }
  await Native.install();
}

/** Canal play: inmediata (bloquea hasta terminar y reinicia sola) o flexible (descarga en segundo plano; al terminar se llama a finishPlayUpdate). */
export async function startPlayUpdate(update, onProgress) {
  const immediate = Boolean(update.mandatory && update.immediate) || !update.flexible;
  const sub = await Native.addListener('playProgress', (event) => onProgress?.(event));
  try { await Native.playStart({ immediate }); } catch (error) { sub.remove(); throw error; }
  return { immediate, stop: () => sub.remove() };
}
export const finishPlayUpdate = () => Native.playComplete();
export const canInstall = () => Capacitor.isNativePlatform() && Boolean(Native);
