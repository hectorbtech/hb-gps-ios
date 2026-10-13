import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, get, hasToken, initApi, post, setToken, setUnauthorizedHandler } from './api.js';
import { biometricAvailable, biometricEnabled, disableBiometric, enableBiometric, readBiometricCredentials, unlockWithBiometric } from './biometric.js';
import { unregisterPush } from './push.js';
import { store } from './storage.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Estados: loading (arrancando), locked (pide la huella), out (pide entrar), in (dentro).
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [me, setMe] = useState(null);
  const [bio, setBio] = useState({ available: false, enabled: false });
  const [lastEmail, setLastEmail] = useState('');

  const refreshBio = useCallback(async () => { setBio({ available: await biometricAvailable(), enabled: await biometricEnabled() }); }, []);
  const signOut = useCallback(async (keepBiometric = true) => {
    await unregisterPush();
    try { await post('/api/auth/logout'); } catch { /* sin red: igual se cierra aquí */ }
    await setToken(null);
    if (!keepBiometric) await disableBiometric();
    setMe(null); setStatus('out'); refreshBio();
  }, [refreshBio]);

  useEffect(() => { setUnauthorizedHandler(() => { setToken(null); setMe(null); setStatus('out'); }); }, []);

  useEffect(() => {
    (async () => {
      await initApi();
      setLastEmail((await store.get('email')) || '');
      await refreshBio();
      if (!hasToken()) { setStatus('out'); return; }
      try {
        const data = await get('/api/auth/me');
        setMe(data);
        if (await biometricEnabled() && await biometricAvailable()) setStatus('locked'); else setStatus('in');
      } catch (err) { setStatus(err instanceof ApiError && err.status === 0 ? 'offline' : 'out'); }
    })();
  }, [refreshBio]);

  const finish = useCallback(async (result, email) => {
    await setToken(result.token);
    await store.set('email', email);
    setLastEmail(email);
    const data = await get('/api/auth/me');
    setMe(data);
    setStatus('in');
  }, []);

  const signIn = useCallback(async (email, password, { remember } = {}) => {
    const { data } = await post('/api/auth/login', { email, password });
    await finish(data, email);
    if (remember) { try { await enableBiometric(email, password); } catch { /* el usuario canceló la huella */ } }
    refreshBio();
  }, [finish, refreshBio]);

  const signInWithBiometric = useCallback(async () => {
    const credentials = await readBiometricCredentials();
    const { data } = await post('/api/auth/login', { email: credentials.username, password: credentials.password });
    await finish(data, credentials.username);
  }, [finish]);

  const unlock = useCallback(async () => { await unlockWithBiometric(); setStatus('in'); }, []);
  const retry = useCallback(async () => {
    setStatus('loading');
    try { const data = await get('/api/auth/me'); setMe(data); setStatus((await biometricEnabled()) && (await biometricAvailable()) ? 'locked' : 'in'); } catch (err) { setStatus(err instanceof ApiError && err.status === 0 ? 'offline' : 'out'); }
  }, []);

  const value = useMemo(() => ({ status, me, bio, lastEmail, signIn, signInWithBiometric, signOut, unlock, retry, refreshBio, enableBiometric, disableBiometric }), [status, me, bio, lastEmail, signIn, signInWithBiometric, signOut, unlock, retry, refreshBio]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
