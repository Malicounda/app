# Configuration des Icônes pour Tauri

## Icônes Requises

Tauri nécessite plusieurs tailles d'icônes pour différentes plateformes :

### Windows
- `icon.ico` - Icône principale (multi-résolution: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256)

### macOS
- `icon.icns` - Icône macOS (multi-résolution)

### Linux/PNG
- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256x256)
- `icon.png` (512x512 recommandé)

## Copier les Icônes Existantes

L'icône existe déjà dans `build/icon.ico`. Pour configurer Tauri :

### Option 1: Copie Manuelle
```powershell
# Créer le dossier icons
New-Item -ItemType Directory -Force -Path "src-tauri/icons"

# Copier l'icône existante
Copy-Item "build/icon.ico" "src-tauri/icons/icon.ico"
```

### Option 2: Utiliser l'icône depuis build/
Modifier `tauri.conf.json` pour pointer vers `../build/icon.ico`

## Générer les Autres Formats (Optionnel)

Si vous avez besoin de générer les autres formats à partir de l'icône existante :

```bash
# Installer tauri-cli globalement
cargo install tauri-cli

# Générer les icônes
cd client
npx @tauri-apps/cli icon path/to/source-icon.png
```

Cela générera automatiquement toutes les tailles nécessaires dans `src-tauri/icons/`.

## Vérification

Après avoir copié les icônes, vérifiez que le dossier `src-tauri/icons/` contient au minimum :
- ✅ `icon.ico` (pour Windows)

Pour un support complet multi-plateforme, ajoutez également :
- `icon.icns` (macOS)
- `32x32.png`, `128x128.png`, `128x128@2x.png` (Linux)
