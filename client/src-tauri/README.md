# 🦀 Configuration Tauri pour SCoDiPP

## 📋 Vue d'Ensemble

Ce dossier contient la configuration Tauri pour transformer l'application React en application desktop native Windows (.exe).

## 🏗️ Structure

```
src-tauri/
├── src/
│   └── main.rs          # Point d'entrée Rust de l'application
├── icons/               # Icônes de l'application (générées)
├── target/              # Dossier de build Rust (généré)
├── Cargo.toml           # Configuration des dépendances Rust
├── tauri.conf.json      # Configuration principale de Tauri
├── build.rs             # Script de build Rust
└── .gitignore           # Fichiers à ignorer par Git
```

## 🚀 Prérequis

### 1. Rust Toolchain
```powershell
# Installer Rust via rustup
# Télécharger depuis: https://rustup.rs/
# Ou exécuter:
winget install Rustlang.Rustup
```

### 2. NSIS (pour créer l'installateur Windows)
```powershell
# Télécharger depuis: https://nsis.sourceforge.io/Download
# Ou via Chocolatey:
choco install nsis
```

### 3. WebView2 (généralement déjà installé sur Windows 10/11)
Si nécessaire, télécharger depuis: https://developer.microsoft.com/microsoft-edge/webview2/

## 📦 Installation

Toutes les dépendances Tauri sont déjà configurées dans le projet :

```bash
# Les dépendances JS sont déjà installées
npm install

# Les dépendances Rust seront installées automatiquement au premier build
```

## 🎨 Configuration des Icônes

### Copier l'icône existante
```powershell
cd src-tauri
.\setup-icons.ps1
```

### Générer tous les formats (optionnel)
```bash
# Si vous avez une icône source en PNG (512x512 recommandé)
npx @tauri-apps/cli icon path/to/icon.png
```

Cela générera automatiquement :
- `icon.ico` (Windows)
- `icon.icns` (macOS)
- `32x32.png`, `128x128.png`, `128x128@2x.png` (Linux)

## 🛠️ Commandes de Développement

### Mode Développement
```bash
# Depuis le dossier client/
npm run tauri:dev
```

Cette commande :
1. Démarre le serveur Vite (http://localhost:5173)
2. Lance l'application Tauri en mode développement
3. Active le hot-reload pour le frontend

### Build de Production
```bash
# Build complet
npm run tauri:build

# Build en mode debug (plus rapide, pour tests)
npm run tauri:build:debug
```

Les fichiers générés se trouvent dans :
```
src-tauri/target/release/bundle/nsis/
├── SCoDiPP_1.0.0_x64-setup.exe    # Installateur
└── SCoDiPP_1.0.0_x64.nsis.zip     # Archive
```

## ⚙️ Configuration

### tauri.conf.json

Fichier de configuration principal. Sections importantes :

#### Build
```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  }
}
```

#### Permissions (Allowlist)
```json
{
  "tauri": {
    "allowlist": {
      "fs": { ... },      // Accès au système de fichiers
      "dialog": { ... },  // Boîtes de dialogue natives
      "http": { ... },    // Requêtes HTTP
      "shell": { ... }    // Commandes shell
    }
  }
}
```

#### Bundle
```json
{
  "bundle": {
    "identifier": "com.aspcchs.scodipp",
    "targets": ["nsis"],
    "icon": ["icons/icon.ico"]
  }
}
```

## 🔗 Communication Frontend ↔ Backend

### Mode Actuel : Backend Distant
L'application Tauri communique avec le backend Express via HTTP :

```typescript
// Dans le code React
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const response = await fetch(`${API_URL}/api/permits`);
```

### Configuration CORS Backend
Le backend doit accepter les requêtes depuis l'application Tauri :

```javascript
// server/index.ts
const corsOptions = {
  origin: [
    'http://localhost:5173',  // Dev
    'tauri://localhost',      // Tauri production
    'https://tauri.localhost' // Tauri production (alternative)
  ],
  credentials: true
};
```

## 🔒 Sécurité

### Content Security Policy (CSP)
Actuellement désactivé pour faciliter le développement :

```json
{
  "tauri": {
    "security": {
      "csp": null
    }
  }
}
```

Pour la production, considérez activer une CSP stricte.

### Permissions
Tauri utilise un système de permissions granulaires. Seules les APIs explicitement autorisées dans `allowlist` sont accessibles.

## 📝 APIs Tauri Disponibles

### Système de Fichiers
```typescript
import { readTextFile, writeTextFile } from '@tauri-apps/api/fs';

const content = await readTextFile('path/to/file.txt');
await writeTextFile('path/to/file.txt', 'Hello Tauri!');
```

### Dialogues
```typescript
import { open, save } from '@tauri-apps/api/dialog';

const selected = await open({
  multiple: false,
  filters: [{
    name: 'PDF',
    extensions: ['pdf']
  }]
});
```

### HTTP
```typescript
import { fetch } from '@tauri-apps/api/http';

const response = await fetch('https://api.example.com/data');
```

### Chemins
```typescript
import { appDataDir, downloadDir } from '@tauri-apps/api/path';

const appData = await appDataDir();
const downloads = await downloadDir();
```

## 🐛 Débogage

### Logs Rust
Les logs Rust s'affichent dans la console où vous avez lancé `tauri dev`.

### DevTools Frontend
En mode développement, les DevTools sont automatiquement disponibles (F12).

### Build Debug
Pour un build avec symboles de débogage :
```bash
npm run tauri:build:debug
```

## 📊 Comparaison Electron vs Tauri

| Critère | Electron | Tauri |
|---------|----------|-------|
| Taille app | ~150 MB | ~15 MB |
| RAM utilisée | ~100-200 MB | ~30-50 MB |
| Démarrage | 2-3s | <1s |
| Sécurité | Moyenne | Élevée |
| Langage backend | JavaScript | Rust |

## 🚀 Déploiement

### 1. Build de Production
```bash
npm run tauri:build
```

### 2. Tester l'Installateur
Testez sur une machine Windows propre ou VM.

### 3. Signature de Code (Recommandé)
Pour éviter les alertes Windows SmartScreen :

```powershell
# Avec un certificat de signature de code
signtool sign /fd SHA256 /a "path/to/SCoDiPP_setup.exe"
```

### 4. Distribution
Distribuez le fichier `SCoDiPP_1.0.0_x64-setup.exe`.

## 📚 Ressources

- [Documentation Tauri](https://tauri.app/)
- [API Reference](https://tauri.app/v1/api/js/)
- [Guide de Migration Electron → Tauri](https://tauri.app/v1/guides/migration/from-electron)
- [Rust Book](https://doc.rust-lang.org/book/) (pour personnalisation avancée)

## 🆘 Dépannage

### Erreur : "Rust not found"
Installez Rust via https://rustup.rs/

### Erreur : "NSIS not found"
Installez NSIS depuis https://nsis.sourceforge.io/Download

### Erreur de build : "WebView2 not found"
Installez WebView2 Runtime depuis Microsoft.

### L'application ne démarre pas
Vérifiez que le backend est accessible à l'URL configurée dans `.env`.

## 📞 Support

Pour toute question ou problème, consultez :
- La documentation Tauri officielle
- Le fichier `ANALYSE_PROJET_TAURI.md` à la racine du projet
- Les issues GitHub de Tauri

---

**Version**: 1.0.0  
**Dernière mise à jour**: Octobre 2025  
**Auteur**: Abdoulaye SENE - Ingénieur des Travaux des Eaux et Forêts
