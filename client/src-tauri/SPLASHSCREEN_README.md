# Splashscreen Tauri - Guide d'utilisation

## 📋 Description

Le splashscreen a été intégré dans l'application Tauri pour offrir une expérience utilisateur professionnelle au démarrage.

## 🎨 Fonctionnalités

- **Animation de chargement** : Barre de progression avec pourcentages
- **Messages de statut** : Affichage des étapes de chargement
- **Design moderne** : Gradient vert, particules animées, logo avec effet brillant
- **Transition fluide** : Le splashscreen se ferme automatiquement après 3 secondes et la fenêtre principale s'ouvre

## 📁 Fichiers modifiés

1. **`splashscreen.html`** : Page HTML du splashscreen avec animations CSS
2. **`tauri.conf.json`** : Configuration des deux fenêtres (splashscreen + main)
3. **`src/main.rs`** : Logique Rust pour gérer l'affichage des fenêtres

## ⚙️ Configuration

### Fenêtre Splashscreen
- **Taille** : 600x400 pixels
- **Sans bordures** : `decorations: false`
- **Toujours au premier plan** : `alwaysOnTop: true`
- **Non redimensionnable** : `resizable: false`
- **Visible au démarrage** : `visible: true`

### Fenêtre Principale
- **Taille** : 1280x800 pixels
- **Redimensionnable** : `resizable: true`
- **Taille minimale** : 800x600 pixels
- **Cachée au démarrage** : `visible: false`

## 🚀 Lancement

### Mode développement
```bash
cd client
npm run tauri:dev
```

Ou utilisez le script PowerShell :
```powershell
cd client
.\run-tauri.ps1
```

### Mode production
```bash
cd client
npm run tauri:build
```

## 🔧 Personnalisation

### Modifier la durée du splashscreen

Dans `src/main.rs`, ligne 23 :
```rust
std::thread::sleep(Duration::from_secs(3)); // Changer 3 par le nombre de secondes souhaité
```

### Modifier les messages de chargement

Dans `splashscreen.html`, lignes 263-269 :
```javascript
const statusMessages = [
  { text: 'Connexion à la base de données...', progress: 20 },
  { text: 'Chargement des configurations...', progress: 40 },
  // Ajouter ou modifier les messages ici
];
```

### Modifier le design

Éditez directement le fichier `splashscreen.html` :
- **Couleurs du gradient** : lignes 16 (background)
- **Taille du logo** : lignes 52-54
- **Animations** : lignes 180-204

## 📝 Notes importantes

1. **Ordre d'affichage** : Le splashscreen apparaît en premier, puis la fenêtre principale après 3 secondes
2. **Fermeture automatique** : Le splashscreen se ferme automatiquement, pas besoin d'intervention utilisateur
3. **Centrage** : Les deux fenêtres sont centrées à l'écran
4. **Performance** : Le splashscreen est léger et ne ralentit pas le démarrage

## 🐛 Dépannage

### Le splashscreen ne s'affiche pas
- Vérifiez que `splashscreen.html` est bien dans le dossier `src-tauri`
- Vérifiez la configuration dans `tauri.conf.json`

### La fenêtre principale ne s'ouvre pas
- Vérifiez les logs de la console
- Assurez-vous que le serveur de développement Vite fonctionne (port 5173)

### Erreur de compilation Rust
- Vérifiez que toutes les dépendances sont installées : `cargo check`
- Nettoyez et recompilez : `cargo clean && cargo build`

## ✅ Résultat attendu

Au lancement de l'application :
1. ✅ Le splashscreen s'affiche immédiatement (600x400px, sans bordures)
2. ✅ La barre de progression se remplit avec des messages de statut
3. ✅ Après 3 secondes, le splashscreen se ferme
4. ✅ La fenêtre principale s'ouvre (1280x800px, avec bordures normales)
5. ✅ L'application est prête à l'utilisation

## 📞 Support

Pour toute question ou problème, consultez la documentation Tauri :
- [Documentation officielle](https://tauri.app/v1/guides/)
- [Splashscreen Guide](https://tauri.app/v1/guides/features/splashscreen/)
