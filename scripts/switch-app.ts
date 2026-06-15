import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import { fileURLToPath } from 'url';

const TARGET = process.argv[2];

if (TARGET !== 'alerte' && TARGET !== 'chasse') {
  console.error('Erreur: Vous devez spécifier "alerte" ou "chasse" en argument.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isAlerte = TARGET === 'alerte';
const appName = isAlerte ? 'EF Alerte' : 'SN Chasse';
const appId = isAlerte ? 'com.eforets.alerte' : 'com.eforets.chasse';
const pyScript = isAlerte ? 'prepare-alerte-apk-assets.py' : 'prepare-chasse-apk-assets.py';

console.log(`\n==============================================`);
console.log(`🔄 Bascule vers l'application : ${appName}`);
console.log(`==============================================\n`);

const rootDir = path.resolve(__dirname, '..');
const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

// 1. Nettoyage des dossiers d'images dans Android res
console.log(`🧹 Nettoyage des anciens dossiers d'images...`);
if (fs.existsSync(androidResDir)) {
  const dirs = fs.readdirSync(androidResDir);
  const dirsToDelete = dirs.filter(d => 
    d.startsWith('drawable-land-') || 
    d.startsWith('drawable-port-') || 
    d.startsWith('mipmap-')
  );

  for (const dir of dirsToDelete) {
    const fullPath = path.join(androidResDir, dir);
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`   - Supprimé: ${dir}`);
  }
} else {
  console.log(`   - Dossier Android res introuvable, on passe.`);
}

// 2. Mise à jour de capacitor.config.ts
console.log(`\n⚙️  Mise à jour de capacitor.config.ts...`);
const capConfigPath = path.join(rootDir, 'capacitor.config.ts');
if (fs.existsSync(capConfigPath)) {
  let configContent = fs.readFileSync(capConfigPath, 'utf8');
  configContent = configContent.replace(/appId:\s*['"][^'"]+['"]/, `appId: '${appId}'`);
  configContent = configContent.replace(/appName:\s*['"][^'"]+['"]/, `appName: '${appName}'`);
  
  // Modification dynamique des logs optionnelle
  if (isAlerte) {
    configContent = configContent.replace(/appendUserAgent:\s*['"][^'"]+['"]/, `appendUserAgent: 'AlerteAPK'`);
  } else {
    configContent = configContent.replace(/appendUserAgent:\s*['"][^'"]+['"]/, `appendUserAgent: 'ChasseAPK'`);
  }
  
  fs.writeFileSync(capConfigPath, configContent);
  console.log(`   - capacitor.config.ts mis à jour (appId: ${appId}, appName: ${appName})`);
}

// 3. Mise à jour de strings.xml
console.log(`\n📝 Mise à jour de strings.xml...`);
const stringsXmlPath = path.join(androidResDir, 'values', 'strings.xml');
if (fs.existsSync(stringsXmlPath)) {
  let stringsContent = fs.readFileSync(stringsXmlPath, 'utf8');
  stringsContent = stringsContent.replace(/<string name="app_name">[^<]+<\/string>/, `<string name="app_name">${appName}</string>`);
  stringsContent = stringsContent.replace(/<string name="title_activity_main">[^<]+<\/string>/, `<string name="title_activity_main">${appName}</string>`);
  stringsContent = stringsContent.replace(/<string name="package_name">[^<]+<\/string>/, `<string name="package_name">${appId}</string>`);
  stringsContent = stringsContent.replace(/<string name="custom_url_scheme">[^<]+<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
  fs.writeFileSync(stringsXmlPath, stringsContent);
  console.log(`   - strings.xml mis à jour`);
}

// 4. Exécution du script Python pour les assets de base
console.log(`\n🐍 Préparation des assets de base avec Python (${pyScript})...`);
try {
  execSync(`python scripts/${pyScript}`, { stdio: 'inherit', cwd: rootDir });
} catch (e) {
  console.log(`   ⚠️ Erreur ou script non trouvé, on tente avec python3...`);
  try {
    execSync(`python3 scripts/${pyScript}`, { stdio: 'inherit', cwd: rootDir });
  } catch (e2) {
    console.error(`   ❌ Échec de l'exécution du script Python.`);
  }
}

// 5. Regénération des assets Android avec capacitor-assets
console.log(`\n🎨 Génération des nouveaux assets Android (capacitor-assets)...`);
try {
  execSync(`npx capacitor-assets generate --android`, { stdio: 'inherit', cwd: rootDir });
} catch (e) {
  console.error(`   ❌ Échec de la génération des assets.`);
}

// 6. Nettoyage du cache Gradle
console.log(`\n🗑️  Nettoyage du cache Gradle Android...`);
try {
  const androidDir = path.join(rootDir, 'android');
  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat clean' : './gradlew clean';
  execSync(gradlewCmd, { stdio: 'inherit', cwd: androidDir });
  console.log(`   - Cache Gradle nettoyé.`);
} catch (e) {
  console.error(`   ❌ Échec du nettoyage Gradle.`);
}

console.log(`\n✅ Terminé ! L'application est maintenant configurée pour : ${appName}\n`);
