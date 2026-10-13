// Referencia de comandos SMS por marca y protocolo. Las plantillas llevan {host}, {port}, {apn}, {pass} (clave del equipo) y se rellenan con los datos del servidor.
// Los comandos salen de los manuales de cada fabricante (fuentes al final de cada marca); si un equipo trae otro manual, manda el del equipo.
export const SMS_BRANDS = [
  {
    id: 'gt06', name: 'Concox / Jimi · GT06, GT06N, CA003-CA005 y OBD2 compatibles', protocol: 'GT06', supported: true,
    notes: 'Los comandos terminan en # y no distinguen mayúsculas; el equipo responde «OK» por SMS (en la mayoría de modelos no llevan clave). Es el protocolo de la mayoría de GPS OBD2 y de los «espías» pequeños.',
    commands: [
      { what: 'Servidor (IP y puerto, TCP)', sms: 'SERVER,0,{host},{port},0#', note: 'Si el servidor es un dominio y no una IP, usa SERVER,1,{host},{port},0#.' },
      { what: 'APN de la SIM', sms: 'APN,{apn}#', note: 'Si la SIM pide usuario y clave: APN,{apn},usuario,clave#' },
      { what: 'Intervalo de reporte (segundos)', sms: 'TIMER,10#', note: 'TIMER,10,600# = cada 10 s con el motor encendido y cada 10 min apagado.' },
      { what: 'Zona horaria (República Dominicana = GMT-4)', sms: 'GMT,W,4,0#', unverified: true, note: 'Si las horas del historial salen corridas, esto lo arregla en el propio equipo.' },
      { what: 'Ver estado (batería, señal, GPS)', sms: 'STATUS#' },
      { what: 'Ver ubicación actual', sms: 'WHERE#' },
      { what: 'Ver todos los parámetros', sms: 'PARAM#' },
      { what: 'Ver servidor y conexión configurados', sms: 'GPRSSET#' },
      { what: 'Enlace de la ubicación', sms: 'URL#' },
      { what: 'Versión del equipo', sms: 'VERSION#' },
      { what: 'Reiniciar el equipo', sms: 'RESET#', note: 'Se reinicia en unos 20 segundos.' },
      { what: 'Borrar toda la configuración (fábrica)', sms: 'FACTORY#', unverified: true, note: 'Solo si no hay otra salida: hay que volver a poner servidor y APN.' }
    ],
    sources: [['Concox GT06N · comandos comunes (manual)', 'https://www.manualslib.com/manual/922101/Concox-Gt06n.html?page=11'], ['Configurar un GT06 (AVLView)', 'https://app.avlview.com/help/supported-devices/concox-configure-gt-06-gps-device/'], ['Protocolo GT06 · formato de paquetes', 'https://traxelio.com/trackers/protocol/gt06']]
  },
  {
    id: 'tk103', name: 'TK103, TK102, Coban GPS103 y clones', protocol: 'GPS103 / TK103', supported: false,
    notes: 'Clave de fábrica: 123456. Cada comando va pegado a la clave y separado de su valor por un espacio. Este protocolo todavía no está habilitado en el puerto público del servidor (hoy: GT06, H02 y JT808): pídelo antes de comprar estos equipos.',
    commands: [
      { what: 'Servidor (IP y puerto)', sms: 'adminip{pass} {host} {port}' },
      { what: 'APN de la SIM', sms: 'apn{pass} {apn}', note: 'Responde «APN OK». Si pide usuario y clave: apnuser{pass} usuario · apnpasswd{pass} clave' },
      { what: 'Intervalo de reporte (30 s)', sms: 't030s***n{pass}', note: 't005s = 5 s · t010s = 10 s · t001m = 1 minuto.' },
      { what: 'Número autorizado', sms: 'admin{pass} +18091234567' },
      { what: 'Cambiar la clave', sms: 'password{pass} 654321', unverified: true },
      { what: 'Fábrica', sms: 'begin{pass}', note: 'Borra toda la configuración.' }
    ],
    sources: [['Coban GPS103 · APN, IP y puerto (manual)', 'https://www.manualslib.com/manual/1030212/Coban-Gps103-A.html?page=17'], ['Configuración por SMS del TK103 (Traccar)', 'https://www.traccar.org/forums/topic/need-sms-configuration-for-tk103/']]
  },
  {
    id: 'micodus', name: 'MiCODUS · MV720, MV730, MV730G, LK720', protocol: 'H02 / JT808 / GT06 según el modelo', supported: true,
    notes: 'Clave de fábrica: 123456. Mismo formato «comando + clave + espacio + valor». Confirma en el manual del modelo si usa H02 o JT808: este servidor acepta ambos.',
    commands: [
      { what: 'Servidor (IP y puerto)', sms: 'adminip{pass} {host} {port}' },
      { what: 'APN de la SIM', sms: 'apn{pass} {apn}' },
      { what: 'Zona horaria', sms: 'timezone{pass} -4', note: 'República Dominicana = GMT-4.' },
      { what: 'Número administrador', sms: 'admin{pass} +18091234567' },
      { what: 'Cambiar la clave (solo 6 dígitos)', sms: 'password{pass} 654321' },
      { what: 'Reiniciar', sms: 'rst', note: 'Guarda la configuración y reinicia.' },
      { what: 'Fábrica', sms: 'begin{pass}', note: 'Borra toda la configuración.' }
    ],
    sources: [['MiCODUS MV720 · manual (comandos)', 'https://www.manualslib.com/manual/2826604/Micodus-Mv720.html?page=8'], ['MiCODUS MV720 · guía del fabricante', 'https://www.micodus.com/uploadfiles/files/f6/f6514a559e-mv720-user-guide-20.pdf'], ['MiCODUS MV730 · guía del fabricante', 'https://www.micodus.com/uploadfiles/files/85/850ad1ab34-mv730-user-guide-20.pdf']]
  },
  {
    id: 'teltonika', name: 'Teltonika · FMB, FMC, FMM', protocol: 'Teltonika (Codec 8)', supported: false,
    notes: 'Hay que poner DOS espacios antes del texto del SMS (y la clave del equipo si la tiene). Este protocolo todavía no está habilitado en el puerto público del servidor.',
    commands: [
      { what: 'APN, servidor y puerto (TCP) de una vez', sms: '  setparam 2001:{apn};2002:;2003:;2004:{host};2005:{port};2006:0', note: '2001 APN · 2002 usuario · 2003 clave del APN · 2004 dominio o IP · 2005 puerto · 2006 protocolo (0 = TCP, 1 = UDP). Dos espacios al inicio.' }
    ],
    sources: [['Teltonika FMB001 · primer arranque (wiki)', 'https://wiki.teltonika-gps.com/wikibase/index.php?title=FMB001_First_Start&mobileaction=toggle_view_desktop'], ['Teltonika FMM001 · configuración rápida por SMS', 'https://www.manualslib.com/manual/1819788/Teltonika-Fmm001.html?page=8']]
  },
  {
    id: 'queclink', name: 'Queclink · GL300, GV300 y familia @Track', protocol: 'Queclink @Track', supported: false,
    notes: 'La clave de fábrica depende del modelo (por ejemplo gl300 o gv300). Todos terminan en $. Este protocolo todavía no está habilitado en el puerto público del servidor.',
    commands: [
      { what: 'APN de la SIM', sms: 'AT+GTBSI={pass},{apn},,,,,,,0001$', note: 'Parámetros: clave, APN, usuario del APN, clave del APN, … número de serie.' },
      { what: 'Servidor (IP y puerto)', sms: 'AT+GTSRI=...', note: 'Lleva más campos según el modelo: usa el formato exacto de la tabla GTSRI del manual @Track.' }
    ],
    sources: [['Queclink GL300 · Bearer Setting (manual)', 'https://www.manualslib.com/manual/1301291/Queclink-Gl300.html?page=16'], ['GL300 @Track Air Interface Protocol', 'https://www.rastreoxp.com/descargas/GL300/Document/GL300%20@Tracker%20Air%20Interface%20Protocol%20V6.00.pdf']]
  },
  {
    id: 'meitrack', name: 'Meitrack · T1, T333, T366 y familia', protocol: 'Meitrack', supported: false,
    notes: 'Clave de fábrica: 0000 (va al inicio de cada comando). Este protocolo todavía no está habilitado en el puerto público del servidor.',
    commands: [
      { what: 'Servidor y APN (TCP)', sms: '0000,A21,1,{host},{port},{apn},,', note: 'Modo 1 = TCP, 2 = UDP. Después del APN van usuario y clave (vacíos aquí).' },
      { what: 'Intervalo de reporte', sms: '0000,A12,...', unverified: true, note: 'A12 ajusta el rastreo por GPRS; revisa el formato exacto en el protocolo SMS de Meitrack.' }
    ],
    sources: [['Protocolo SMS de Meitrack (todos los modelos)', 'https://www.meitrack.com/cd-download/Protocols/MEITRACK_SMS_Protocol.pdf']]
  }
];

export const DETECTION = [
  ['78 78 / 79 79', 'GT06 / Concox y la mayoría de OBD2'],
  ['*HQ,', 'H02 (MiCODUS y clones)'],
  ['7E', 'JT808 (MiCODUS y otros)']
];

export const TIPS = [
  ['El GPS no aparece conectado', 'Revisa en este orden: (1) la SIM tiene saldo y datos, (2) el APN está bien puesto, (3) la IP y el puerto del servidor son los de esta pantalla, (4) el equipo tiene señal celular (STATUS#). Cuando se conecte, aparecerá solo en «GPS detectados» con su IMEI y protocolo.'],
  ['La hora sale corrida (por ejemplo 8 horas atrás)', 'El servidor lo detecta y lo corrige solo después de unos minutos de datos. Para arreglarlo de raíz, ajusta la zona horaria en el equipo (GT06: GMT,W,4,0# · MiCODUS: timezone123456 -4). Si ya hay historial con la hora mala, en el detalle del GPS está «Reparar el historial anterior».'],
  ['«Sin moverse desde…» no coincide con la realidad', 'Mira «Último dato del GPS» en el detalle: si es viejo y el GPS sigue conectado, el equipo no está mandando posiciones nuevas (sin satélites, antena tapada, intervalo muy largo o hora mal ajustada).'],
  ['Intervalo de reporte', 'Lo normal es 10 segundos con el motor encendido. Más corto = mapa más fino pero más datos y batería; más largo = menos datos. Se cambia desde Editar sin enviar SMS (el servidor lo manda al equipo cuando se conecta).'],
  ['Seguridad', 'Cambia la clave de fábrica del equipo y deja un número administrador. No compartas los SMS de configuración: quien los tenga puede redirigir el GPS a otro servidor.']
];
