# Publicar HB GPS en el App Store (iPhone)

## Estado (2026-10-12) — lo que YA está listo
- **Proyecto iOS** en `hb-gps/mobile/ios` (Capacitor + Swift Package Manager). Solo iPhone, vertical, iOS 15 o superior. Ícono 1024, pantalla de inicio, permiso de Face ID, avisos push por Firebase, sin actualizador por APK (en iPhone actualiza el App Store), servidor `https://hectorgps.com`.
- **Compilación en la nube:** `hb-gps/codemagic.yaml` (Codemagic → TestFlight). Sintaxis validada, **nunca ejecutada**: puede necesitar un ajuste en el primer build real.
- **Ficha completa** en `store/ficha-app-store.md`: nombre, subtítulo, texto promocional, palabras clave, descripción, categoría, edades, etiquetas de privacidad y notas para el revisor. Límites de caracteres verificados.
- **Capturas** en `store/app-store-assets/`: iPhone 6,9" (1320×2868) y 6,5" (1284×2778), 6 cada una, más `icono-1024.png`.
- **Política de privacidad** ya publicada: https://hectorgps.com/privacidad
- **Página de soporte** (la pide Apple, incluye cómo eliminar la cuenta): `portal/public/soporte.html`, preparada pero **sin publicar**. Se publica con `bash hb-gps/deploy/publish-privacy.sh` (no toca la API ni la base).
- **Servidor:** el API ya acepta tokens de iPhone y envía con opciones de Apple (`api/src/push.mjs`); falta desplegarlo al relay con `deploy-relay.sh`.
- **Android no cambió:** `cap sync android` sin diferencias; el plugin de Firebase para iPhone solo se instala al compilar iOS.

## Lo que falta (en este orden)
**Cuando pagues la membresía** (US$99/año; developer.apple.com/programs). Apple activa la cuenta de unas horas a un par de días (como empresa, más: pide D-U-N-S).

1. **App Store Connect** (appstoreconnect.apple.com) → Apps → «+» → Nueva app: nombre `HB GPS`, idioma Español, identificador `com.hectorbtech.hbgps` (aparece cuando se registra en Identificadores; Apple lo ofrece al crear), SKU `hbgps-ios`. Anota el **Apple ID numérico** (Información de la app → General).
2. **Llave de API de App Store Connect:** Usuarios y acceso → Integraciones → Claves → «+» con rol *App Manager*. Descarga el `.p8` (solo se baja una vez; guárdalo fuera de la PC) y anota *Issuer ID* y *Key ID*.
3. **Firebase** (proyecto `hector--b-systems`): Configuración del proyecto → agregar app **iOS** con `com.hectorbtech.hbgps` → descarga `GoogleService-Info.plist`. Luego crea una **llave APNs** (developer.apple.com → Certificados, identificadores y perfiles → Claves → «Apple Push Notifications service») y súbela en Firebase → Configuración → Cloud Messaging → Apple.
4. **Repositorio privado** (GitHub/GitLab/Bitbucket) con el contenido de la carpeta `hb-gps` en la raíz (debe incluir `mobile/`, `portal/` y `codemagic.yaml`). No subas `mobile/keystore/` (ya está ignorado). Antes, hacer commit de los cambios pendientes de `hb-gps`.
5. **Codemagic** (codemagic.io; plan gratuito con minutos limitados): conecta el repositorio → Teams → Integrations → *App Store Connect* con la llave del paso 2 llamada **HBT App Store Connect** → en la app, *Environment variables*, grupo **hbgps_ios**:
   - `APP_STORE_APPLE_ID` = el número del paso 1.
   - `GOOGLE_SERVICE_INFO_PLIST_B64` = el plist en base64 (marcar como segura). En PowerShell:
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("GoogleService-Info.plist"))`
6. Ejecuta el flujo **hbgps-ios** en Codemagic: compila, firma y sube a **TestFlight**.
7. **Publicar la página de soporte** (si no se hizo): `bash hb-gps/deploy/publish-privacy.sh`.
8. **Cuenta demo para el revisor** (pendiente de decidir contigo): crear una empresa «Demo App Store» en el portal con un usuario de demostración y 1–2 equipos con datos de ejemplo, y poner su correo y clave en las notas del revisor (`[CORREO_DEMO]`, `[CLAVE_DEMO]` en `ficha-app-store.md`).
9. En App Store Connect: pegar los textos de `ficha-app-store.md`, subir las capturas, responder edades y etiquetas de privacidad, elegir la compilación de TestFlight y **enviar a revisión**.

## Probar antes de enviar (TestFlight)
Instala TestFlight en tu iPhone, acepta la invitación y comprueba: entrar, Face ID, mapa, historial, comandos y que **llegue un aviso push con la app cerrada**. Si el push no llega: revisa la llave APNs en Firebase y el plist.

## Tiempos esperables
Cuenta Apple: horas a 2 días (empresa: 1–4 semanas) · primer build: horas a 2 días · TestFlight: 15–60 min de procesamiento · revisión: normalmente 24–48 h · si Apple pide aclaraciones, suma 1–2 días por ronda. Total típico: 2–5 días tras subir; 1–2 semanas con observaciones.

## Cada versión nueva
Sube `versionName` y `versionCode` en `mobile/android/app/build.gradle` (iPhone usa la misma) y ejecuta de nuevo el flujo en Codemagic: el número de compilación de TestFlight sube solo.

## Cómo está armado (por si compilas en un Mac propio)
```bash
cd hb-gps/mobile
npm ci
node scripts/ios-prepare.mjs     # instala Firebase Messaging solo para iOS, compila la web, sincroniza, ajusta versión
open ios/App/App.xcodeproj       # firmar con tu equipo en Xcode y archivar
```
- `@capacitor-firebase/messaging` **no está en package.json** a propósito: en Android choca con `@capacitor/push-notifications` (los dos registran un servicio para el mismo evento de Firebase). `ios-prepare.mjs` lo instala y registra temporalmente, restaura `package.json` al terminar y retira el plugin de push de Capacitor de `Package.swift` (solo iOS).
- Sin el plugin instalado (Android, web, desarrollo) `vite.config.js` usa un sustituto vacío (`src/lib/firebase-messaging-stub.js`); con el plugin instalado se incluye el real (verificado: el paquete de iPhone lo trae y el de Android no).
- En Windows `cap sync ios` falla por la opción de enlaces simbólicos (`symlink`) que necesita el plugin de Firebase; en un Mac funciona. No es un error de la app.
- Capturas: `scripts/play-screenshots.mjs` (con `VIEW` y `OUT`) + `scripts/app-store-sets.mjs`; requieren la API de pruebas (`node hb-gps/api/dev-local.mjs`), los simuladores de GPS y `npm run dev`.

## Cosas que Apple revisa
- Que sea más que una web envuelta (usa Face ID, notificaciones push y mapa propio).
- Si se pueden crear cuentas desde la app, debe poder eliminarse la cuenta desde la app. Aquí las cuentas las crea el administrador; la página de soporte explica cómo pedir la eliminación y las notas del revisor lo aclaran.
- Que la política y las etiquetas de privacidad coincidan con lo que la app hace.
- La función de apagado remoto del motor: explicada en las notas del revisor (advertencia, registro y uso por la empresa dueña del vehículo).
