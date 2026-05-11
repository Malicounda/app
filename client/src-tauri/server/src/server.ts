import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createConnection } from 'typeorm';
import { createTerminus } from '@godaddy/terminus';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { ValidationError } from 'class-validator';

import config from './config';
import logger, { stream } from './utils/logger';
import { errorMiddleware } from './middleware/error.middleware';

import { dbConnection } from './database';
import { socketService } from './services/socket.service';

class App {
  public app: Application;
  public port: string | number;
  public env: string;
  public server: HttpServer;
  public io: SocketIOServer;

  constructor(registerRoutes: (app: Application) => void) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.port = config.port;
    this.env = config.nodeEnv;

    this.initializeMiddlewares();
    this.initializeRoutes(registerRoutes);
    this.initializeErrorHandling();
    this.initializeSocketIO();
  }

  public async start() {
    try {
      // Connexion à la base de données
      await this.connectToDatabase();
      
      // Démarrer le serveur avec gestion de la santé
      const server = createTerminus(this.server, {
        healthChecks: {
          '/health': this.onHealthCheck,
          verbatim: true,
        },
        onSignal: this.onSignal,
        onShutdown: this.onShutdown,
        logger: (msg: string, err: Error | undefined) => logger.error(err || msg),
      });

      server.listen(this.port, () => {
        logger.info(`=================================`);
        logger.info(`======= ENV: ${this.env} =======`);
        logger.info(`🚀 App listening on port ${this.port}`);
        logger.info(`=================================`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public getServer(): Application {
    return this.app;
  }

  private initializeMiddlewares() {
    // Middleware de sécurité
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.corsOrigin,
      credentials: true,
    }));
    
    // Middleware de compression
    this.app.use(compression());
    
    // Parser les requêtes JSON
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Parser les cookies
    this.app.use(cookieParser());
    
    // Middleware de journalisation
    this.app.use(morgan(config.logs.level === 'debug' ? 'dev' : 'combined', { stream }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: 'Trop de requêtes depuis cette adresse IP, veuillez réessayer plus tard.',
    });
    this.app.use(limiter);
    
    // Désactiver l'en-tête X-Powered-By
    this.app.disable('x-powered-by');
  }

  private initializeRoutes(registerRoutes: (app: Application) => void) {
    // Route de base
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'Bienvenue sur l\'API du Système de Gestion des Permis de Chasse',
        version: '1.0.0',
        environment: this.env,
        timestamp: new Date().toISOString(),
      });
    });

    // Routes de l'API
    registerRoutes(this.app); // Call the main route registration function

  }

  private initializeErrorHandling() {
    // Gestion des erreurs
    this.app.use(errorMiddleware);
  }

  private initializeSocketIO() {
    // Initialiser le service de socket
    socketService.initialize(this.io);
    
    // Gestion des connexions socket
    this.io.on('connection', (socket) => {
      logger.info(`Nouvelle connexion socket: ${socket.id}`);
      
      // Gérer les événements personnalisés ici
      socket.on('disconnect', () => {
        logger.info(`Déconnexion socket: ${socket.id}`);
      });
    });
  }

  private async connectToDatabase() {
    try {
      await createConnection(dbConnection);
      logger.info('🟢 Base de données connectée avec succès');
    } catch (error) {
      logger.error('🔴 Erreur de connexion à la base de données:', error);
      throw error;
    }
  }

  // Gestion de la santé de l'application
  private async onHealthCheck() {
    // Vérifier la connexion à la base de données
    try {
      // Implémenter des vérifications de santé supplémentaires si nécessaire
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // Nettoyage avant l'arrêt
  private async onSignal() {
    logger.info('Le serveur reçoit le signal d\'arrêt');
    // Effectuer le nettoyage nécessaire avant l'arrêt
    return Promise.resolve();
  }

  // Nettoyage après l'arrêt
  private async onShutdown() {
    logger.info('Nettoyage avant l\'arrêt du serveur');
    // Effectuer un nettoyage final si nécessaire
    return Promise.resolve();
  }
}

export default App;
