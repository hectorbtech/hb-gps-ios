import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric';
import { isNative } from './api.js';
import { store } from './storage.js';

const SERVER = 'hb-gps-login';

// Huella o rostro: las credenciales se guardan cifradas en el almacén seguro del teléfono y solo se leen después de verificar la huella.
export async function biometricAvailable() {
  if (!isNative) return false;
  try { return (await NativeBiometric.isAvailable()).isAvailable; } catch { return false; }
}
export async function biometricEnabled() { return (await store.get('biometric')) === '1'; }

export async function enableBiometric(email, password) {
  await NativeBiometric.setCredentials({ username: email, password, server: SERVER, accessControl: AccessControl.BIOMETRY_CURRENT_SET, title: 'HB GPS', negativeButtonText: 'Cancelar' });
  await store.set('biometric', '1');
}
export async function disableBiometric() {
  try { await NativeBiometric.deleteCredentials({ server: SERVER }); } catch { /* ya no había */ }
  await store.set('biometric', null);
}
export async function readBiometricCredentials() {
  return NativeBiometric.getSecureCredentials({ server: SERVER, reason: 'Entrar a HB GPS', title: 'HB GPS', subtitle: 'Confirma que eres tú', negativeButtonText: 'Usar contraseña' });
}
// Cierre de pantalla al abrir la app: pide la huella antes de mostrar nada.
export async function unlockWithBiometric() {
  await NativeBiometric.verifyIdentity({ reason: 'Abrir HB GPS', title: 'HB GPS', subtitle: 'Confirma que eres tú', negativeButtonText: 'Cancelar', maxAttempts: 3 });
}
