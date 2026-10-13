// Genera los íconos de la app (launcher, adaptativo, notificación y pantalla de inicio) a partir de un dibujo vectorial propio.
// Uso: node scripts/make-icons.mjs   (usa `sharp`, que ya está en el repositorio principal)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../backend/package.json'));
const sharp = require('sharp');
const res = path.resolve(here, '../android/app/src/main/res');

const NAVY = '#0B1F3A';
// Pin de ubicación blanco con la ruta punteada y el punto verde de la marca.
const pin = (scale = 1, dx = 0, dy = 0) => `
  <g transform="translate(${256 + dx} ${256 + dy}) scale(${scale}) translate(-256 -256)">
    <path d="M256 70c-72 0-130 56-130 126 0 92 130 246 130 246s130-154 130-246c0-70-58-126-130-126z" fill="#fff"/>
    <circle cx="256" cy="196" r="52" fill="${NAVY}"/>
    <circle cx="256" cy="196" r="26" fill="#16a34a"/>
    <path d="M96 440c60-26 120-18 160 0s100 26 160 0" fill="none" stroke="#2f63d8" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 26"/>
  </g>`;
const full = (bg = NAVY, rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${bg}"/>${pin(0.78, 0, -8)}</svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${pin(0.5, 0, -6)}</svg>`; // zona segura del ícono adaptativo (66 %)
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${NAVY}"/>${pin(0.7, 0, -8)}</svg>`;

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [name, size] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${name}`);
  await sharp(Buffer.from(full(NAVY, 96))).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
  await sharp(Buffer.from(round)).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  await sharp(Buffer.from(foreground)).resize(Math.round(size * 2.25), Math.round(size * 2.25)).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
}

// Pantalla de inicio: fondo azul marino con el pin al centro.
const splashSizes = fs.readdirSync(res).filter((d) => d.startsWith('drawable') && fs.existsSync(path.join(res, d, 'splash.png')));
for (const dir of splashSizes) {
  const file = path.join(res, dir, 'splash.png');
  const meta = await sharp(file).metadata();
  const w = meta.width; const h = meta.height; const s = Math.round(Math.min(w, h) * 0.36);
  const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${pin(1, 0, 0)}</svg>`)).resize(s, s).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: NAVY } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(`${file}.tmp`);
  fs.renameSync(`${file}.tmp`, file);
}

// Ícono de las notificaciones (silueta blanca, como exige Android).
fs.writeFileSync(path.join(res, 'drawable', 'ic_stat_icon_config_sample.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13c0,-3.87 -3.13,-7 -7,-7zM12,11.5c-1.38,0 -2.5,-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5 2.5,1.12 2.5,2.5 -1.12,2.5 -2.5,2.5z"/>
</vector>
`);
console.log('Íconos listos.');
