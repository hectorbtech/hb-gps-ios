// Arma las carpetas de capturas para App Store Connect (iPhone 6,9" = 1320x2868 y 6,5" = 1284x2778) y copia el icono de 1024.
// Uso: VIEW=440x956@3 OUT=_raw-iphone69 node scripts/play-screenshots.mjs ; VIEW=428x926@3 OUT=_raw-iphone65 node scripts/play-screenshots.mjs ; node scripts/app-store-sets.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.resolve(here, '../../../backend/package.json'))('sharp');
const assets = path.resolve(here, '../store/play-assets');
const out = path.resolve(here, '../store/app-store-assets');
const chosen = [['03-mapa-resumen', '1-mapa-en-vivo'], ['01-mapa-flota', '2-toda-tu-flota'], ['04-detalle', '3-detalle-del-equipo'], ['06b-historial-reproduccion', '4-historial-de-recorridos'], ['07-comandos', '5-comandos-a-distancia'], ['02-equipos', '6-lista-de-equipos']];
for (const [raw, final] of [['_raw-iphone69', 'iphone-6.9-pulgadas-1320x2868'], ['_raw-iphone65', 'iphone-6.5-pulgadas-1284x2778']]) {
  fs.mkdirSync(path.join(out, final), { recursive: true });
  for (const [from, to] of chosen) await sharp(path.join(assets, raw, `${from}.png`)).flatten({ background: '#ffffff' }).removeAlpha().png().toFile(path.join(out, final, `${to}.png`));
  const meta = await sharp(path.join(out, final, '1-mapa-en-vivo.png')).metadata();
  console.log(final, `${meta.width}x${meta.height}`);
}
fs.copyFileSync(path.resolve(here, '../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), path.join(out, 'icono-1024.png'));
console.log('Listo →', out);
