// Compila la APK firmada de HB GPS: web → Capacitor → Gradle → out/HB-GPS-<versión>.apk
// Uso (desde hb-gps/mobile):  npm run apk
// Requisitos: JDK 17+ (JAVA_HOME), Android SDK (ANDROID_HOME) y la llave en keystore/ + android/keystore.properties (ver README).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, cwd = root) => execSync(command, { cwd, stdio: 'inherit', env: process.env });

if (!fs.existsSync(path.join(root, 'android', 'keystore.properties'))) {
  console.error('Falta android/keystore.properties (la llave de firma). Sin ella la APK no se puede instalar como actualización.');
  process.exit(1);
}
const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
const version = gradle.match(/versionName "([^"]+)"/)?.[1] || '0.0.0';

run('npx vite build');
run('npx cap sync android');
run(process.platform === 'win32' ? 'gradlew.bat assembleDirectRelease' : './gradlew assembleDirectRelease', path.join(root, 'android'));

const built = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'direct', 'release', 'app-direct-release.apk');
if (!fs.existsSync(built)) { console.error('Gradle terminó pero no dejó la APK en', built); process.exit(1); }
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const target = path.join(root, 'out', `HB-GPS-${version}.apk`);
fs.copyFileSync(built, target);
console.log(`\nAPK lista: ${target} (${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
