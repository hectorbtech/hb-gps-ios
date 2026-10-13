// Arma las carpetas finales de capturas para escritorio/Chromebook y tabletas (7" y 10") a partir de las capturas en bruto (_raw-*).
// Uso: node scripts/play-sets.mjs   (despues de correr play-screenshots.mjs con VIEW/OUT para cada tamaño)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.resolve(here, '../../../backend/package.json'))('sharp');
const base = path.resolve(here, '../store/play-assets');
const chosen = [['03-mapa-resumen', '1-mapa-en-vivo'], ['01-mapa-flota', '2-toda-tu-flota'], ['04-detalle', '3-detalle-del-equipo'], ['06b-historial-reproduccion', '4-historial-de-recorridos'], ['07-comandos', '5-comandos-a-distancia'], ['02-equipos', '6-lista-de-equipos']];
for (const [raw, final] of [['_raw-escritorio', 'escritorio-chromebook-1920x1080'], ['_raw-tableta7', 'tableta-7-pulgadas-1200x1920'], ['_raw-tableta10', 'tableta-10-pulgadas-1600x2560']]) {
  fs.mkdirSync(path.join(base, final), { recursive: true });
  for (const [from, to] of chosen) await sharp(path.join(base, raw, `${from}.png`)).flatten({ background: '#ffffff' }).removeAlpha().png().toFile(path.join(base, final, `${to}.png`));
  const meta = await sharp(path.join(base, final, '1-mapa-en-vivo.png')).metadata();
  console.log(final, `${meta.width}x${meta.height}`);
}
