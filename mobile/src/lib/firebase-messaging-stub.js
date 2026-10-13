// Sustituto vacio de @capacitor-firebase/messaging. Se usa SOLO cuando ese plugin no esta instalado (Android, web y desarrollo):
// el plugin real se instala unicamente al compilar la app de iPhone (scripts/ios-prepare.mjs) porque en Android choca con @capacitor/push-notifications.
// En iPhone el codigo que lo usa solo corre cuando la plataforma es iOS, asi que aqui nunca se ejecuta con efecto.
export const FirebaseMessaging = {
  checkPermissions: async () => ({ receive: 'denied' }),
  requestPermissions: async () => ({ receive: 'denied' }),
  getToken: async () => ({ token: '' }),
  deleteToken: async () => undefined,
  addListener: async () => ({ remove: async () => undefined }),
};
