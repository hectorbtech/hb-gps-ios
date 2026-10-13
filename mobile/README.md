# HB GPS · app móvil (Android)

App de HB GPS con el diseño aprobado: entrar (con huella o rostro), mapa en vivo, detalle, lista de equipos, historial con reproducción,
comandos (apagar/restablecer el motor), alertas y rutas seguras. Es una app web (React + Leaflet) empaquetada con Capacitor; reutiliza del
portal (`../portal/src`) el mapa, los formatos y los textos de error.

## Servidor
La dirección del servidor (la IP del VPS relay, sin dominio) va fija dentro de la app: el cliente no la ve ni la puede cambiar. Si cambia, se publica una APK nueva (ver «Actualizaciones»). La sesión viaja como token en la cabecera `Authorization`.

## Desarrollo
```bash
npm install
npm run dev        # http://127.0.0.1:5192 (usa la API local en :8780 con el proxy de Vite)
```

## Compilar la APK
```bash
npm run apk        # → out/HB-GPS-<versión>.apk
```
Necesita JDK 17+ y el Android SDK. La APK se firma con `keystore/hbgps-release.jks` (contraseñas en `android/keystore.properties`; ninguno
de los dos se sube a git). **Guarda una copia de la llave**: sin ella no se pueden publicar actualizaciones sobre la misma instalación.
Para una versión nueva sube `versionCode` y `versionName` en `android/app/build.gradle`.

## Íconos
`node scripts/make-icons.mjs` regenera los íconos y la pantalla de inicio.

## Actualizaciones de la app
La app busca una versión nueva al abrir (y en Cuenta → Buscar actualización). Para publicarla:
1. Sube `versionCode` y `versionName` en `android/app/build.gradle` y corre `npm run apk`.
2. `bash hb-gps/deploy/publish-apk.sh hb-gps/mobile/out/HB-GPS-<versión>.apk "Qué cambió" [versión mínima obligatoria]` (desde la raíz del repo).
La app descarga la APK con barra de avance y abre el instalador de Android (un toque en «Instalar»). Android solo acepta APK firmadas con la misma llave.

## Avisos push (pantalla del teléfono con la app cerrada)
Usan Firebase Cloud Messaging. Falta de tu lado:
1. En Firebase (proyecto `hector--b-systems`) agrega una app Android con el paquete `com.hectorbtech.hbgps` y descarga su `google-services.json` a `android/app/`.
2. En Configuración del proyecto → Cuentas de servicio, genera una clave privada y cópiala al relay como `/opt/hb-gps/secrets/fcm-service-account.json`.
3. `npm install @capacitor/push-notifications` y vuelve a compilar la APK.
La API ya envía el aviso a los teléfonos de la empresa (y, del cliente final, solo los de sus GPS); sin la clave no hace nada.

## Google Play y App Store
- `npm run aab` genera el bundle para Google Play (`out/HB-GPS-<version>-play.aab`). Esa version se actualiza por Google Play (inmediata si es obligatoria). La APK directa (`npm run apk`) se actualiza descargandola de tu servidor.
- Guias y textos listos en `store/`: `guia-google-play.md`, `guia-app-store.md` y `politica-de-privacidad.md` (completar los [CAMPOS]).
