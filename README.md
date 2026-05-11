# SCoDi - Système de Contrôle et de Digitalisation

Application web mobile  . Version: V1.01 00491.

## Structure du Projet

```
.
├── client/                  # Application frontend (React + TypeScript + Vite)
│   ├── public/             # Fichiers statiques
│   ├── src/                 # Code source du frontend
│   │   ├── assets/         # Images, polices, etc.
│   │   ├── components/     # Composants React réutilisables
│   │   ├── contexts/       # Contextes React
│   │   ├── hooks/          # Hooks personnalisés
│   │   ├── lib/            # Utilitaires et helpers
│   │   ├── pages/          # Composants de page
│   │   ├── App.tsx         # Composant racine
│   │   └── main.tsx        # Point d'entrée de l'application
│   ├── .env                # Variables d'environnement
│   ├── index.html          # Point d'entrée HTML
│   ├── package.json        # Dépendances et scripts
│   ├── tsconfig.json       # Configuration TypeScript
│   └── vite.config.ts      # Configuration Vite
│
├── server/                 # API backend (Node.js + Express + TypeScript)
│   ├── src/               # Code source du backend
│   │   ├── controllers/    # Contrôleurs
│   │   ├── middleware/     # Middleware Express
│   │   ├── models/         # Modèles de données
│   │   ├── routes/         # Définition des routes
│   │   ├── services/       # Logique métier
│   │   ├── utils/          # Utilitaires
│   │   ├── app.ts          # Configuration Express
│   │   └── server.ts       # Point d'entrée du serveur
│   ├── .env               # Variables d'environnement
│   ├── package.json       # Dépendances et scripts
│   └── tsconfig.json      # Configuration TypeScript
│
└── shared/                # Code partagé entre le client et le serveur
    └── schema/            # Schémas et types TypeScript
        ├── types/         # Définitions de types
        ├── constants.ts   # Constantes partagées
        └── utils.ts       # Utilitaires partagés
```

## Prérequis

- Node.js (v18+)
- npm (v9+) ou yarn (v1.22+)
- PostgreSQL (v14+)

## Installation

1. **Cloner le dépôt**
   ```bash
   git clone [URL_DU_DEPOT]
   cd A.S.P.CH.S
   ```

2. **Installer les dépendances**
   ```bash
   # Dans le dossier racine
   npm install

   # Installer les dépendances du client
   cd client
   npm install

   # Installer les dépendances du serveur
   cd ../server
   npm install
   ```

3. **Configurer les variables d'environnement**

   Créez un fichier `.env` dans les dossiers `client` et `server` en vous basant sur les fichiers `.env.example` respectifs.

4. **Configurer la base de données**

   - Créez une base de données PostgreSQL
   - Exécutez les migrations :
     ```bash
     cd server
     npx knex migrate:latest
     npx knex seed:run
     ```

## Démarrage en mode développement

1. **Démarrer le serveur backend**
   ```bash
   cd server
   npm run dev
   ```

2. **Démarrer le client frontend**
   ```bash
   cd client
   npm run dev
   ```

3. **Accéder à l'application**
   - Frontend : http://localhost:5173
   - API : http://localhost:3000

## Scripts utiles

### Client
- `npm run dev` - Démarrer le serveur de développement
- `npm run build` - Construire pour la production
- `npm run preview` - Prévisualiser la version de production
- `npm run lint` - Exécuter le linter
- `npm run type-check` - Vérifier les types TypeScript

### Serveur
- `npm run dev` - Démarrer en mode développement avec rechargement à chaud
- `npm run build` - Compiler le code TypeScript
- `npm start` - Démarrer le serveur en production
- `npm run lint` - Exécuter le linter
- `npm run migrate` - Exécuter les migrations de base de données
- `npm run seed` - Exécuter les seeders de base de données

## Environnements

- **Développement** : `NODE_ENV=development`
- **Test** : `NODE_ENV=test`
- **Production** : `NODE_ENV=production`

## Tests

```bash
# Exécuter les tests du client
cd client
npm test

# Exécuter les tests du serveur
cd ../server
npm test
```

## Déploiement

### Préparation pour la production

1. Construire le client :
   ```bash
   cd client
   npm run build
   ```

2. Construire le serveur :
   ```bash
   cd ../server
   npm run build
   ```

### Options de déploiement

- **Déploiement monolithique** : Le client est servi par le serveur Express
- **Déploiement séparé** : Le client est déployé séparément (ex: Vercel, Netlify) et communique avec l'API distante

## Architecture Technique

- **Frontend** : React 18, TypeScript, Vite, TailwindCSS, React Query
- **Backend** : Node.js, Express, TypeScript, Knex.js, PostgreSQL
- **Authentification** : JWT, bcrypt
- **Validation** : Zod
- **Tests** : Jest, React Testing Library
- **Linting** : ESLint, Prettier

## Contribution

1. Créez une branche pour votre fonctionnalité : `git checkout -b feature/ma-nouvelle-fonctionnalite`
2. Committez vos changements : `git commit -am 'Ajouter une super fonctionnalité'`
3. Poussez vers la branche : `git push origin feature/ma-nouvelle-fonctionnalite`
4. Créez une Pull Request

## Licence

[À définir]
