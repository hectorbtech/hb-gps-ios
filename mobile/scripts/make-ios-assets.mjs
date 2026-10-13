// Icono (1024x1024 sin transparencia) y pantalla de inicio de iPhone, con el mismo dibujo que el icono de Android.
// Uso: node scripts/make-ios-assets.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.resolve(here, '../../../backend/package.json'))('sharp');
const assets = path.resolve(here, '../ios/App/App/Assets.xcassets');
const NAVY = '#0B1F3A';
const pin = (scale = 1, dx = 0, dy = 0) => `
  <g transform="translate(${256 + dx} ${256 + dy}) scale(${scale}) translate(-256 -256)">
    <path d="M256 70c-72 0-130 56-130 126 0 92 130 246 130 246s130-154 130-246c0-70-58-126-130-126z" fill="#fff"/>
    <circle cx="256" cy="196" r="52" fill="${NAVY}"/>
    <circle cx="256" cy="196" r="26" fill="#16a34a"/>
    <path d="M96 440c60-26 120-18 160 0s100 26 160 0" fill="none" stroke="#2f63d8" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 26"/>
  </g>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${NAVY}"/>${pin(0.78, 0, -8)}</svg>`;
await sharp(Buffer.from(square)).resize(1024, 1024).flatten({ background: NAVY }).removeAlpha().png().toFile(path.join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'));
const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${pin(1, 0, 0)}</svg>`)).resize(980, 980).png().toBuffer();
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 3, background: NAVY } }).composite([{ input: logo, gravity: 'center' }]).png().toFile(path.join(assets, 'Splash.imageset', file));
}
console.log('Icono y pantalla de inicio de iPhone listos.');
