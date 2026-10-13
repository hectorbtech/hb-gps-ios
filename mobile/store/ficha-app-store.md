# Ficha de App Store · HB GPS (todo listo para pegar en App Store Connect)

Identificador del paquete: `com.hectorbtech.hbgps` · SKU sugerido: `hbgps-ios` · Idioma principal: Español (México o Latinoamérica; si no aparece, «Español (España)») · Precio: gratis.

## Información de la app
| Campo | Texto | Límite |
|---|---|---|
| Nombre | `HB GPS` | 30 |
| Subtítulo | `Rastreo GPS de tu flota` | 30 |
| Texto promocional | `Ubica tus vehículos en vivo, recibe alertas al instante y revisa el historial de cada recorrido, todo desde tu iPhone.` | 170 |
| Palabras clave | `gps,rastreo,flota,vehiculos,geovallas,alertas,localizador,monitoreo,transporte,camiones,ubicacion` | 100 |
| URL de soporte | https://hectorgps.com/soporte | |
| URL de marketing | https://hectorgps.com | |
| URL de privacidad | https://hectorgps.com/privacidad | |
| Derechos de autor | `© 2026 Hector B Tech` | |
| Categoría principal / secundaria | Navegación / Negocios | |
| Novedades de la versión 1.0 | `Primera versión de HB GPS para iPhone.` | 4000 |

## Descripción (máx. 4000)
```
HB GPS te muestra dónde están tus vehículos y equipos en tiempo real, directo desde tu iPhone. Es la app del servicio de rastreo HB GPS: entras con la cuenta que te da el administrador de tu empresa y ves tu flota al instante.

QUÉ PUEDES HACER

• Ver tus equipos en vivo: ubicación en el mapa, velocidad, rumbo, estado del motor, batería, voltaje y calidad de la señal.
• Ver la dirección real de cada punto, no solo coordenadas.
• Consultar el historial de recorridos por día: dónde estuvo, por dónde pasó y cuánto se movió.
• Crear geovallas y recibir un aviso cuando un equipo entra o sale de una zona.
• Definir rutas seguras y enterarte si un vehículo se desvía.
• Recibir alertas al momento en tu iPhone: exceso de velocidad, motor encendido o apagado, batería baja, pérdida de señal y más.
• Enviar órdenes a distancia a los equipos que lo permiten, como apagar el motor. Cada orden queda registrada con el usuario que la hizo.
• Llevar el control de mantenimiento de cada vehículo.
• Compartir la ubicación de un equipo con un enlace que tú controlas: vence solo o lo revocas cuando quieras.
• Abrir cualquier punto en otros mapas, copiarlo, pedir cómo llegar o enviarlo por WhatsApp.

PARA QUIÉN ES

Empresas de transporte, distribución, alquiler, instalaciones y servicios con flotas, y también dueños que quieren saber dónde está su vehículo. Cada empresa ve solo sus propios equipos, y un cliente final ve únicamente los suyos.

SEGURIDAD Y PRIVACIDAD

• Acceso con correo y contraseña, y opción de entrar con Face ID o Touch ID. La verificación la hace tu iPhone: la app no recibe ni guarda tu huella ni tu rostro.
• Las contraseñas se guardan cifradas y las conexiones usan cifrado.
• La app no usa la ubicación de tu iPhone: solo muestra la de los equipos GPS instalados.
• No vendemos tus datos ni los usamos para publicidad.
• Puedes pedir la eliminación de tu cuenta cuando quieras.

REQUISITOS

Necesitas una cuenta activa de HB GPS y equipos GPS dados de alta en tu empresa. Si aún no tienes cuenta, pídela a tu administrador o escríbenos a support@hectorbtech.online.

HB GPS también está disponible como portal web en https://hectorgps.com con la misma cuenta.
```
Antes de pegar: quita de la lista cualquier aviso que tu servicio no tenga activo (por ejemplo «pérdida de señal»), para no prometer de más.

## Clasificación por edades
Responder **Ninguna** a todo el cuestionario (sin violencia, contenido sexual, apuestas, etc.). Resultado esperado: **4+**.

## Privacidad de la app («etiquetas de privacidad»)
- **¿Rastreas a los usuarios?** No.
- **Datos que se recopilan** (todos vinculados a la identidad del usuario, finalidad «Funcionalidad de la app», no se usan para publicidad):
  - Información de contacto: **nombre** y **correo electrónico** (la cuenta).
  - Ubicación: **ubicación precisa** (la de los equipos GPS rastreados, no la del teléfono). Se declara por prudencia porque identifica el recorrido de un vehículo/conductor.
  - Identificadores: **ID de dispositivo** (identificador de notificaciones push de Firebase).
  - Otros datos: registros de uso/seguridad (inicios de sesión y órdenes enviadas).
- Cifrado en tránsito: sí. Se puede pedir la eliminación de los datos: sí (ver soporte).

## Notas para el revisor de Apple (pegar en «Información de revisión»)
```
HB GPS es la app de un servicio de rastreo de vehículos para empresas. Las cuentas las crea el administrador de cada empresa (no hay registro público), por eso adjuntamos una cuenta de demostración con datos de ejemplo.

Cuenta de demostración
Correo: [CORREO_DEMO]
Contraseña: [CLAVE_DEMO]

Cómo probar
1) Inicia sesión: se abre el mapa con 3 equipos de ejemplo.
2) Toca un equipo para ver su resumen; «Detalles» muestra estado, conductor, alertas y mantenimiento.
3) «Historial» reproduce el recorrido del día.
4) «Comandos» muestra las órdenes a distancia. Apagar o restablecer el motor es una función sensible: exige aceptar una advertencia, se puede programar para cuando el vehículo se detenga y queda registrada con el usuario y la hora. Está pensada para que una empresa proteja sus propios vehículos ante robo; en la cuenta de demostración no hay equipos reales conectados.
5) «Alertas» lista los avisos; las notificaciones push llegan con la app cerrada.

La app no usa la ubicación del iPhone: solo muestra la posición de los equipos GPS instalados en los vehículos de la empresa. Face ID es opcional y solo desbloquea las credenciales guardadas en el llavero del teléfono.
Eliminación de cuenta: se solicita en https://hectorgps.com/soporte (las cuentas las gestiona el administrador de cada empresa).
```

## Capturas (carpeta `store/app-store-assets/`)
- **iPhone 6,9"** (1320×2868): obligatorias. Subir las 6 de `iphone-6.9-pulgadas-1320x2868`.
- **iPhone 6,5"** (1284×2778): opcionales pero recomendadas. Subir las 6 de `iphone-6.5-pulgadas-1284x2778`.
- Ícono de 1024 (sin transparencia): `icono-1024.png` (ya va dentro de la app; App Store Connect lo toma del compilado).
- iPad: no aplica (la app es solo para iPhone).
