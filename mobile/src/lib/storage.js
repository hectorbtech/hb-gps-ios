import { Preferences } from '@capacitor/preferences';

// Preferencias de la app (servidor, sesión, opciones). En el teléfono van a las preferencias privadas de la app; en el navegador, a localStorage.
export const store = {
  async get(key) { try { return (await Preferences.get({ key })).value; } catch { return null; } },
  async set(key, value) { try { if (value == null) await Preferences.remove({ key }); else await Preferences.set({ key, value: String(value) }); } catch { /* sin almacenamiento: se pide de nuevo */ } },
  async getJson(key, fallback) { const raw = await this.get(key); try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  setJson(key, value) { return this.set(key, JSON.stringify(value)); }
};
