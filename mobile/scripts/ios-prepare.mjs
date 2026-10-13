// Prepara el proyecto iOS para compilar (en Codemagic o en un Mac):
//   1) instala @capacitor-firebase/messaging SOLO para esta compilacion (en Android choca con @capacitor/push-notifications, por eso no vive
//      en package.json; Capacitor descubre los plugins leyendo package.json, asi que se registra temporalmente y se restaura al terminar),
//   2) compila la web con el soporte de iPhone, 3) sincroniza Capacitor con iOS,
//   4) retira @capacitor/push-notifications SOLO de iOS (el token de avisos en iPhone lo da Firebase Messaging),
//   5) fija la version (la misma de Android: versionName) y el numero de compilacion (IOS_BUILD_NUMBER o el versionCode de Android),
//   6) si existe ios/App/App/GoogleService-Info.plist (Firebase), lo agrega al proyecto de Xcode para que quede dentro de la app.
// Uso: node scripts/ios-prepare.mjs        Variables: IOS_BUILD_NUMBER (opcional), SKIP_WEB_BUILD=1 (si la web ya esta compilada)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, env = process.env) => execSync(command, { cwd: root, stdio: 'inherit', env });
const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
const versionName = gradle.match(/versionName "([^"]+)"/)?.[1] || '1.0.0';
const versionCode = gradle.match(/versionCode (\d+)/)?.[1] || '1';
const build = process.env.IOS_BUILD_NUMBER || versionCode;

const pkgJson = path.join(root, 'package.json');
const lockJson = path.join(root, 'package-lock.json');
const saved = { pkg: fs.readFileSync(pkgJson), lock: fs.existsSync(lockJson) ? fs.readFileSync(lockJson) : null };

try {
  run('npm install --no-audit --no-fund @capacitor-firebase/messaging@^8.5.2 firebase@^12.6.0');
  if (!process.env.SKIP_WEB_BUILD) run('npx vite build', { ...process.env, HBGPS_IOS: '1' });
  run('npx cap sync ios');
} finally {
  // package.json vuelve a como estaba: el plugin de Firebase no debe quedar registrado para las compilaciones de Android.
  fs.writeFileSync(pkgJson, saved.pkg);
  if (saved.lock) fs.writeFileSync(lockJson, saved.lock);
}

// --- Package.swift: sin el plugin de push de Capacitor ---
const pkgFile = path.join(root, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
const pkgBefore = fs.readFileSync(pkgFile, 'utf8');
let pkg = pkgBefore.split('\n').filter((line) => !line.includes('CapacitorPushNotifications')).join('\n');
pkg = pkg.replace(/,(\s*\n\s*[\])])/g, '$1'); // una coma colgando antes de un cierre
fs.writeFileSync(pkgFile, pkg);
console.log(pkgBefore === pkg ? 'Package.swift: no habia plugin de push de Capacitor que retirar.' : 'Package.swift: retirado @capacitor/push-notifications (iOS usa Firebase Messaging).');
if (!pkg.includes('CapacitorFirebaseMessaging')) { console.error('ERROR: Package.swift no incluye CapacitorFirebaseMessaging; los avisos push no funcionarian.'); process.exit(1); }

// --- project.pbxproj: version, compilacion y Firebase ---
const projFile = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let proj = fs.readFileSync(projFile, 'utf8');
proj = proj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);

const plist = path.join(root, 'ios', 'App', 'App', 'GoogleService-Info.plist');
if (fs.existsSync(plist) && !proj.includes('GoogleService-Info.plist')) {
  const fileRef = 'A1B2C3D4E5F60718293A4B02';
  const buildFile = 'A1B2C3D4E5F60718293A4B01';
  const T = '\t';
  proj = proj
    .replace('/* Begin PBXBuildFile section */\n', `/* Begin PBXBuildFile section */\n${T}${T}${buildFile} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* GoogleService-Info.plist */; };\n`)
    .replace('/* Begin PBXFileReference section */\n', `/* Begin PBXFileReference section */\n${T}${T}${fileRef} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };\n`)
    .replace(/(504EC3061FED79650016851F \/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \(\n)/, `$1${T}${T}${T}${T}${fileRef} /* GoogleService-Info.plist */,\n`)
    .replace(/(\/\* Begin PBXResourcesBuildPhase section \*\/[\s\S]*?files = \(\n)/, `$1${T}${T}${T}${T}${buildFile} /* GoogleService-Info.plist in Resources */,\n`);
  console.log('Firebase: GoogleService-Info.plist agregado al proyecto de Xcode.');
}
fs.writeFileSync(projFile, proj);
console.log(`iOS: version ${versionName}, compilacion ${build}.`);
if (!fs.existsSync(plist)) console.log('AVISO: falta ios/App/App/GoogleService-Info.plist (Firebase). Sin el, la app compila pero no recibe avisos push.');
