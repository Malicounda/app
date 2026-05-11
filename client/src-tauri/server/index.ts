import express, { type Request, type Response, type NextFunction, type Express } from 'express';
import session from 'express-session';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { setupVite } from './vite.js';
import { storage } from './storage.js';
import { db } from './db.js';
import { sql } from 'drizzle-orm/sql';
import { User } from './types/user.js';
import registerRoutes from './routes/index.js'; // Assuming 'routes' is a directory with an index file
import ecoZonesRoutes from './routes/ecoZones.routes.js'; // Ajout des routes pour les zones écogéographiques
import zonesRoutes from './routes/zones.routes.js'; // Nouvelles routes pour la table zones
import alertsRoutes from './routes/alerts.routes.js';
import settingsRoutes from './routes/settings.routes.js'; // Ajout de l'import
import permitRequestsRoutes from './routes/permit-requests-simple.routes.js'; // Routes pour les demandes de permis
import permitValidationRoutes from './routes/permit-validation.routes.js'; // Routes pour la validation de permis
import protectedZonesRoutes from './routes/protectedZones.routes.js';
import shapefileRoutes from './routes/shapefile.routes.js'; // Routes pour l'upload de shapefile
import infractionsRoutes from './routes/infractions.routes.js'; // Routes pour les infractions
import { log } from './utils/logger.js';
import cron from 'node-cron';
import jwt from 'jsonwebtoken';

// Configuration des chemins de fichiers pour les modules ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
const envPath = path.resolve(process.cwd(), '.env');
log(`Chemin du fichier .env: ${envPath}`, 'config');

if (fs.existsSync(envPath)) {
  log("Fichier .env trouvé", 'config');
} else {
  log("Fichier .env non trouvé !", 'config');
}

dotenv.config({ path: envPath });

// Initialiser l'application Express
const app: Express = express();


// Configuration CORS
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // En environnement non-production, autoriser toutes les origines pour le dev (inclut 5174)
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // En production, on restreint aux origines autorisées
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://192.168.252.85:5173',
      'http://192.168.166.85:5173',
      'http://192.168.1.11:5173', // IP réseau actuelle
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];

    // Autoriser les domaines serveo.net (tunnels SSH)
    if (!origin || allowedOrigins.includes(origin) || (origin && origin.includes('.serveo.net'))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['set-cookie', 'Authorization'],
  optionsSuccessStatus: 200, // Pour les navigateurs plus anciens
  maxAge: 600 // Durée de mise en cache des pré-vérifications CORS (en secondes)
};

// Appliquer CORS
app.use(cors(corsOptions));

// Middleware pour gérer manuellement les requêtes OPTIONS (prévol)
app.options('*', cors(corsOptions));

/* // Middleware pour ajouter les en-têtes CORS manquants (Probablement redondant avec la configuration ci-dessus)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'set-cookie, Authorization');

  // Répondre immédiatement aux requêtes OPTIONS (prévol)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});
*/

// Middleware pour parser le JSON et les données de formulaire
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration de la session
const allowInsecure = process.env.ALLOW_INSECURE_COOKIES === 'true';
const isProd = process.env.NODE_ENV === 'production';
const sessionConfig: session.SessionOptions = {
  name: 'connect.sid',
  secret: process.env.SESSION_SECRET || 'sigpe-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: isProd, // httpOnly activé en prod
    // En prod, secure=true; si ALLOW_INSECURE_COOKIES=true (tests LAN HTTP), alors secure=false
    secure: isProd && !allowInsecure,
    // En prod strict; si on autorise lan http, basculer en 'lax' pour compatibilité
    sameSite: isProd && !allowInsecure ? 'strict' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    // Ne pas spécifier de domaine pour permettre l'utilisation avec localhost et IP
    domain: undefined
  },
  store: process.env.REDIS_URL
    ? new (require('connect-redis')(session))({ url: process.env.REDIS_URL })
    : new session.MemoryStore()
};

// Initialiser le middleware de session AVANT les routes
app.use(session(sessionConfig));

// Middleware pour vérifier et gérer la session
app.use((req: Request, res: Response, next: NextFunction) => {
  // Debug optionnel des sessions (activable via DEBUG_SESSIONS=true)
  if (process.env.DEBUG_SESSIONS === 'true') {
    console.log('Session ID:', req.sessionID);
    console.log('Cookies reçus:', req.headers.cookie);
    console.log('Session User (avant traitement route):', req.session?.user);
  }

  // Définir les routes API qui doivent passer par leur propre middleware d'authentification
  const isPublicOrHasOwnAuth = (r: Request): boolean => {
    const p = r.path;
    // Auth publiques
    if (p === '/api/auth/login' || p === '/api/auth/register') return true;
    // Public username/email availability checks
    if (p.startsWith('/api/auth/check-username') || p.startsWith('/api/auth/check-email')) return true;
    // Vérification d'identifiant chasseur (utilisée à l'inscription)
    if (p.startsWith('/api/hunters/check-id')) return true;
    // Création du profil chasseur pendant l'inscription
    if (p === '/api/hunters' && r.method === 'POST') return true;
    // Inscription / connexion
    if (p === '/api/users/register' && r.method === 'POST') return true;
    // Données publiques cartographiques (GET seulement)
    if (p.startsWith('/api/eco-zones') && r.method === 'GET') return true;
    if (p.startsWith('/api/protected-zones') && r.method === 'GET') return true;
    if (p.startsWith('/api/zones') && r.method === 'GET') return true; // Rendre les ZICs/Amodiées accessibles publiquement pour la carte
    // Statuts des régions (utilisé pour coloriser la carte sans authentification)
    if (p.startsWith('/api/statuses/regions')) return true;
    // Armes (types, marques, calibres) pour formulaires publics
    if (p.startsWith('/api/weapons')) return true;

    // Routes qui ont leur propre middleware d'authentification - les laisser passer
    if (p.startsWith('/api/hunters/')) return true;
    if (p.startsWith('/api/permits/')) return true;
    if (p.startsWith('/api/guides/')) return true;
    if (p.startsWith('/api/guide-hunter-associations/')) return true;
    if (p.startsWith('/api/declaration-especes/')) return true;
    if (p.startsWith('/api/users/')) return true;
    if (p.startsWith('/api/messages/')) return true;
    if (p.startsWith('/api/alerts/')) return true;
    if (p.startsWith('/api/history/')) return true;
    // Nouvelles activités de chasse (router dédié avec isAuthenticated)
    if (p.startsWith('/api/hunting-activities/')) return true;
    if (p.startsWith('/api/stats/')) return true;
    if (p.startsWith('/api/permit-requests/')) return true;
    if (p.startsWith('/api/settings/')) return true;
    if (p.startsWith('/api/taxes/')) return true;
    if (p.startsWith('/api/species/')) return true;
    if (p.startsWith('/api/regional/')) return true;
    if (p.startsWith('/api/attachments/')) return true;

    return false;
  };

  // Fallback JWT global: si aucun user en session, essayer de décoder un Bearer token
  if (!req.session?.user && !req.user) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_TOKEN || 'changeme_secret';
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        (req as any).user = decoded;
      } catch (e) {
        // Token invalide: ignorer, on laissera la règle suivante gérer le 401
      }
    }
  }

  // Si la route est une API, n'a pas sa propre auth, et qu'il n'y a ni session utilisateur ni user issu du JWT
  if (req.path.startsWith('/api') && !isPublicOrHasOwnAuth(req) && !(req.session?.user || req.user)) {
    if (process.env.DEBUG_SESSIONS === 'true') {
      console.log(`[AUTH MIDDLEWARE] Accès non autorisé bloqué pour: ${req.method} ${req.path}`);
    }
    return res.status(401).json({ message: 'Session expirée ou non authentifiée' });
  }

  next();
});

// Middleware pour ajouter l'utilisateur à la requête s'il est connecté
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.session.user) {
    req.user = req.session.user;
  }
  next();
});

// Middleware pour logger les requêtes
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 9);

  res.on('finish', () => {
    const duration = Date.now() - start;
    log(`[${requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`, 'request');
  });

  next();
});

// Middleware pour désactiver la mise en cache pour les routes API
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});

// Enregistrer les routes pour les zones écogéographiques
app.use('/api/eco-zones', ecoZonesRoutes);

// Enregistrer les routes pour les zones (ZIC/Amodiées)
app.use('/api/zones', zonesRoutes);

// Enregistrer les routes pour les zones protégées
app.use('/api/protected-zones', protectedZonesRoutes);

// Enregistrer les routes pour l'upload de shapefile
app.use('/api/shapefile', shapefileRoutes);
console.log('✅ Route shapefile enregistrée : POST /api/shapefile/upload');

// Enregistrer les routes pour les demandes de permis
app.use('/api/permit-requests', permitRequestsRoutes);


// Enregistrer les routes pour la validation de permis
app.use('/api/permit-validation', permitValidationRoutes);

// Enregistrer les routes principales
interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  [key: string]: any;
}

app.use((err: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.status || err.statusCode || 500;

  // Journalisation de l'erreur
  log(`[${req.method} ${req.originalUrl}] Erreur ${statusCode}: ${err.message}`, 'error');

  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Réponse d'erreur
  res.status(statusCode).json({
    status: 'error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Enregistrer les routes d'alertes et de configuration
app.use('/api/alerts', alertsRoutes);
app.use('/api/settings', settingsRoutes);

// Enregistrer les routes pour les infractions
app.use('/api/infractions', infractionsRoutes);
console.log('✅ Routes infractions enregistrées : /api/infractions/*');

// Fonction pour démarrer le serveur
const startServer = async (): Promise<HttpServer> => {
  try {
    // Vérifier la connexion à la base de données
    try {
      // Vérifier la connexion en effectuant une requête simple
      await db.execute(sql.raw('SELECT 1'));
      log('✅ Connecté à la base de données', 'database');
    } catch (error) {
      log('❌ Erreur de connexion à la base de données:', 'database');
      console.error(error);
      process.exit(1);
    }

    // Créer le serveur HTTP
    const server: HttpServer = createServer(app);

    // Exposer le dossier des uploads en statique (pour les photos, pièces jointes, etc.)
    // Sert /uploads/... depuis le répertoire racine du projet
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      log(`Dossier uploads trouvé: ${uploadsDir}`, 'static');
    } else {
      log(`Dossier uploads introuvable: ${uploadsDir}`, 'static');
    }

    // Route pour les fichiers uploads qui n'existent pas
    app.get('/uploads/*', (req: Request, res: Response) => {
      const filePath = path.join(uploadsDir, req.path.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) {
        // Si le client fournit un type MIME, l'appliquer pour forcer un rendu inline (utile si le fichier n'a pas d'extension)
        const qMime = typeof req.query.mime === 'string' ? req.query.mime : undefined;
        if (qMime) {
          try { res.type(qMime); } catch {}
          res.setHeader('Content-Disposition', 'inline');
        }
        res.sendFile(filePath);
      } else {
        res.status(404).json({ error: 'Fichier non trouvé', path: req.path });
      }
    });

    // Enregistrer les routes API
    registerRoutes(app);

    // Servir les fichiers statiques du client uniquement pour les routes non-API
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api')) {
        express.static(path.join(__dirname, '../client'))(req, res, next);
      } else {
        next();
      }
    });

    // Route catch-all pour le client (seulement si le fichier n'existe pas)
    app.get('*', (req: Request, res: Response, next: any) => {
      // Vérifier si le fichier statique existe
      const clientDir = path.resolve(__dirname, '../client');

      let fileExists = false;

      // Vérifier dans uploads
      if (req.path.startsWith('/uploads/')) {
        const filePath = path.join(uploadsDir, req.path.replace('/uploads/', ''));
        fileExists = fs.existsSync(filePath);
      }

      if (!fileExists && !req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDir, 'index.html'));
      } else if (!fileExists) {
        next();
      }
    });

    // Démarrer le serveur (par défaut 3000 pour correspondre au proxy Vite)
    const PORT = parseInt(process.env.PORT || '3000', 10);
    const HOST = process.env.HOST || '0.0.0.0'; // Écouter sur toutes les interfaces

    server.listen(PORT, HOST, () => {
      log(`🚀 Serveur démarré sur http://localhost:${PORT}`, 'server');
      log(`🌐 Accessible via réseau sur http://${HOST}:${PORT}`, 'server');
      log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`, 'server');

      // Démarrer le cron job pour l'auto-validation des déclarations
      // Exécuter toutes les 30 minutes
      cron.schedule('*/30 * * * *', async () => {
        log('⏰ Exécution de l\'auto-validation des déclarations...', 'cron');
        try {
          // Import dynamique via chemin absolu pour éviter la résolution TypeScript hors rootDir
          const absPath = path.resolve(process.cwd(), 'scripts/auto-approve-declarations.ts');
          if (!fs.existsSync(absPath)) {
            log(`⚠️ Script cron introuvable: ${absPath} (auto-validation désactivée)`, 'cron');
            return;
          }
          const fileUrl = new URL('file://' + absPath.replace(/\\/g, '/'));
          // @ts-ignore - import dynamique hors périmètre TS (évite l'analyse rootDir/include)
          const mod = await (Function('u', 'return import(u)') as any)(fileUrl.href);
          const fn = (mod as any).autoApproveDeclarations as (() => Promise<void>) | undefined;
          if (typeof fn === 'function') {
            await fn();
          } else {
            log('⚠️ autoApproveDeclarations introuvable dans le module', 'cron');
          }
        } catch (error) {
          log('❌ Erreur lors de l\'auto-validation:', 'cron');
          console.error(error);
        }
      });

      log('⏰ Cron job d\'auto-validation configuré (toutes les 30 minutes)', 'cron');
    });

    // Gestion propre de l'arrêt du serveur
    const shutdown = async () => {
      log('\n🛑 Arrêt du serveur en cours...', 'server');

      // Fermer le serveur
      server.close(async () => {
        log('✅ Serveur arrêté', 'server');

        // Fermer la connexion à la base de données
        try {
          if (typeof (storage as any).shutdown === 'function') {
            await (storage as any).shutdown();
            log('✅ Déconnecté de la base de données', 'database');
          }
        } catch (error) {
          log('❌ Erreur lors de la déconnexion de la base de données:', 'database');
          console.error(error);
        }

        process.exit(0);
      });

      // Forcer l'arrêt après 5 secondes
      setTimeout(() => {
        log('❌ Forçage de l\'arrêt du serveur...', 'server');
        process.exit(1);
      }, 5000);
    };

    // Gérer les signaux d'arrêt
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
  } catch (error) {
    log('❌ Erreur lors du démarrage du serveur:', 'server');
    console.error(error);
    process.exit(1);
    throw error; // Pour satisfaire le type de retour
  }
};

// Démarrer le serveur
startServer().catch((error: Error) => {
  console.error('Erreur critique lors du démarrage du serveur:', error);
  process.exit(1);
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error: Error) => {
  log(`🚨 Erreur non capturée: ${error.message}`, 'uncaught');
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise) => {
  log(`🚨 Rejet de promesse non géré: ${reason}`, 'unhandled');
  console.error('Promesse rejetée:', promise);
});
