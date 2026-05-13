# Stage 1: Build environment
FROM node:22-alpine AS builder

ENV PUPPETEER_SKIP_DOWNLOAD=true

# Configuration du dossier de travail
WORKDIR /app

# Installation de pnpm (optionnel mais recommandé si pnpm-lock.yaml existe)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copie des fichiers de configuration des paquets pour optimiser le cache Docker
COPY package.json pnpm-lock.yaml* package-lock.json* ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# Installation de toutes les dépendances
RUN npm install

# Copie de tout le code source
COPY . .

# Construction des modules (shared, server, client)
RUN npm run build

# Stage 2: Production environment
FROM node:22-alpine AS runner

WORKDIR /app

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copie depuis le builder
COPY --from=builder /app /app

# Suppression des dépendances de développement pour alléger l'image (optionnel selon le mono-repo)
# RUN npm prune --production

# Création d'un dossier pour les uploads si nécessaire
RUN mkdir -p uploads && chown -R node:node /app

# Changement d'utilisateur pour la sécurité (Secure by design)
USER node

# Exposition du port
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
