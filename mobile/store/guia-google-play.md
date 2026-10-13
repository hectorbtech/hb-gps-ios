# Publicar HB GPS en Google Play

## Datos fijos de la app
- **Nombre del paquete (applicationId):** `com.hectorbtech.hbgps` (no se puede cambiar después de publicar).
- **Política de privacidad (URL pública):** https://hectorgps.com/privacidad (publicada el 2026-10-12; fuente en `hb-gps/portal/public/privacidad.html`).

## Qué necesitas (una sola vez)
1. **Cuenta de desarrollador de Google Play**: pago único de US$25 en play.google.com/console. Verifican la identidad (y la empresa, si es cuenta de organización: se necesita número D-U-N-S).
   - Cuenta **personal** nueva: Google exige una prueba cerrada con **12 testers durante 14 días** antes de dar acceso a producción. Una cuenta de **organización** no tiene ese requisito.
2. **Política de privacidad pública**: ya publicada en https://hectorgps.com/privacidad (pega esa URL en Play Console).
3. **Material de la ficha:** ícono 512×512, imagen de funciones 1024×500, 2 a 8 capturas del teléfono, descripción corta (80 caracteres) y larga.
4. **Formularios en Play Console:** clasificación de contenido, público objetivo, **Seguridad de los datos** (ubicación de equipos, cuenta, identificadores de notificaciones) y declaración de permisos.

## Compilar el paquete
```bash
cd hb-gps/mobile
npm run aab      # → out/HB-GPS-<versión>-play.aab
```
- Se firma con la llave `keystore/hbgps-release.jks`. En Play Console actívala como **llave de subida** (Play App Signing): Google guarda la llave final y tú conservas la de subida. **Guarda copia de la llave.**
- Cada subida necesita un `versionCode` mayor (`android/app/build.gradle`).
- La versión de Google Play (`play`) no puede instalar APK por su cuenta (Google lo prohíbe); se actualiza por Google Play.

## Subir y publicar
1. Play Console → Crear app → nombre «HB GPS», idioma español, app gratuita.
2. Prueba interna (hasta 100 testers, sin revisión larga) → sube el `.aab` y prueba en un teléfono real.
3. Completa ficha, formularios y política → pasa a prueba cerrada → producción. La primera revisión tarda de unas horas a varios días.

## Actualizaciones dentro de la app
- La app consulta a Google Play al abrir. **Obligatoria:** al publicar la versión pon «prioridad de actualización» 4 o 5; la app bloquea hasta actualizar. **Normal:** prioridad 0 a 3, se descarga en segundo plano y pide reiniciar.
- Solo funciona si la app se instaló desde Google Play (no con una APK instalada a mano). Se prueba con la prueba interna de Play Console.

## Ojo
- La app habla con el servidor por `http://` (IP). Google lo permite, pero conviene comprar el dominio y poner HTTPS antes de publicar: protege las sesiones y evita problemas en la revisión.
- La versión de Play y la APK directa son canales distintos: Android no deja actualizar una sobre otra (llaves de firma distintas). Quien instaló por APK debe desinstalar e instalar desde Play.
