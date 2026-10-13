// Recursos graficos de la ficha de Google Play: icono 512x512, imagen de funciones 1024x500 y las capturas elegidas (sin canal alfa).
// Uso (despues de node scripts/play-screenshots.mjs):  node scripts/play-graphics.mjs   → store/play-assets/{icono-512.png, imagen-de-funciones-1024x500.png, telefono/*.png}
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../backend/package.json'));
const sharp = require('sharp');
const out = path.resolve(here, '../store/play-assets');
const shots = path.join(out, 'capturas');
fs.mkdirSync(path.join(out, 'telefono'), { recursive: true });

const NAVY = '#0B1F3A';
const pin = (scale = 1, dx = 0, dy = 0) => `
  <g transform="translate(${256 + dx} ${256 + dy}) scale(${scale}) translate(-256 -256)">
    <path d="M256 70c-72 0-130 56-130 126 0 92 130 246 130 246s130-154 130-246c0-70-58-126-130-126z" fill="#fff"/>
    <circle cx="256" cy="196" r="52" fill="${NAVY}"/>
    <circle cx="256" cy="196" r="26" fill="#16a34a"/>
    <path d="M96 440c60-26 120-18 160 0s100 26 160 0" fill="none" stroke="#2f63d8" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 26"/>
  </g>`;

// 1) Icono 512x512: cuadrado completo, sin esquinas redondeadas ni sombra (Google aplica su propia mascara).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${NAVY}"/>${pin(0.78, 0, -8)}</svg>`;
await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(path.join(out, 'icono-512.png'));

// 2) Capturas elegidas, en el orden en que conviene mostrarlas.
const chosen = [['03-mapa-resumen', '1-mapa-en-vivo'], ['01-mapa-flota', '2-toda-tu-flota'], ['04-detalle', '3-detalle-del-equipo'], ['06b-historial-reproduccion', '4-historial-de-recorridos'], ['07-comandos', '5-comandos-a-distancia'], ['02-equipos', '6-lista-de-equipos']];
for (const [from, to] of chosen) {
  await sharp(path.join(shots, `${from}.png`)).flatten({ background: '#ffffff' }).removeAlpha().png().toFile(path.join(out, 'telefono', `${to}.png`));
}

// 3) Imagen de funciones 1024x500: texto a la izquierda y dos telefonos con capturas reales a la derecha.
const phone = async (file, height) => {
  const radius = Math.round(height * 0.075);
  const shot = await sharp(path.join(shots, `${file}.png`)).flatten({ background: '#fff' }).resize({ height: height - 12 }).png().toBuffer();
  const meta = await sharp(shot).metadata();
  const w = meta.width + 12; const h = height;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect width="${meta.width}" height="${meta.height}" rx="${radius - 4}" fill="#fff"/></svg>`);
  const screen = await sharp(shot).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" fill="#0a1626" stroke="#3a4f6b" stroke-width="2"/></svg>`);
  return { buffer: await sharp(frame).composite([{ input: screen, left: 6, top: 6 }]).png().toBuffer(), w, h };
};
const back = await phone('06b-historial-reproduccion', 410);
const front = await phone('03-mapa-resumen', 450);
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1F3A"/><stop offset="1" stop-color="#16407f"/></linearGradient></defs>
  <rect width="1024" height="500" fill="url(#g)"/>
  <circle cx="900" cy="80" r="240" fill="#2f63d8" opacity="0.18"/>
  <g transform="translate(52 56) scale(0.2)">${pin(1, 0, 0)}</g>
  <text x="168" y="126" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#ffffff">HB GPS</text>
  <text x="52" y="226" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">Tus vehículos en vivo,</text>
  <text x="52" y="276" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">en tu teléfono</text>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="#cfe0ff">
    <text x="52" y="344">●  Alertas al instante</text>
    <text x="52" y="382">●  Historial y geovallas</text>
    <text x="52" y="420">●  Comandos a distancia</text>
  </g>
</svg>`;
await sharp(Buffer.from(bg)).composite([
  { input: back.buffer, left: 566, top: 70 },
  { input: front.buffer, left: 740, top: 38 },
]).flatten({ background: NAVY }).removeAlpha().png().toFile(path.join(out, 'imagen-de-funciones-1024x500.png'));
console.log('Recursos listos en', out);
