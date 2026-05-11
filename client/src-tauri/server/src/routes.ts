import { Router } from 'express';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join, extname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import multer from 'multer';

// Configuration pour les imports ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import des types et utilitaires
import { Route } from './interfaces/route.interface.js';
import { authenticateToken } from './middleware/auth.js';
import { checkRole } from './middleware/roles.js';
import { ROLES } from './config/roles.js';
import { UPLOAD_CONFIG } from './config/config.js';

// Configuration de Multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Créer le répertoire s'il n'existe pas
    const uploadDir = resolve(process.cwd(), UPLOAD_CONFIG.uploadDir);
    
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_CONFIG.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error('Type de fichier non autorisé');
      error.name = 'MulterError';
      cb(error);
    }
  },
});

// Gestion des erreurs de Multer
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      message: err.code === 'LIMIT_FILE_SIZE' 
        ? 'La taille du fichier dépasse la limite autorisée (5MB)'
        : 'Erreur lors du téléchargement du fichier'
    });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Contrôleurs factices pour éviter les erreurs de compilation
class MessagesController {
  getInbox() {}
  getSentMessages() {}
  sendMessage() {}
  markAsRead() {}
  deleteMessage() {}
}

class WeaponsController {
  getWeaponTypes() { return []; }
  getWeaponBrands() { return []; }
  getWeaponCalibers() { return []; }
}

// Contrôleur pour les documents des chasseurs
class HunterDocumentsController {
  async getHunterDocuments(req: any, res: any) {
    try {
      // Implémentation factice - à remplacer par la logique réelle
      res.json([]);
    } catch (error) {
      res.status(500).json({ message: 'Erreur lors de la récupération des documents' });
    }
  }

  async uploadDocument(req: any, res: any) {
    try {
      // Implémentation factice - à remplacer par la logique réelle
      res.json({ message: 'Document téléchargé avec succès' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
    }
  }

  async downloadDocument(req: any, res: any) {
    try {
      // Implémentation factice - à remplacer par la logique réelle
      res.download('chemin/vers/le/fichier');
    } catch (error) {
      res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
    }
  }

  async deleteDocument(req: any, res: any) {
    try {
      // Implémentation factice - à remplacer par la logique réelle
      res.json({ message: 'Document supprimé avec succès' });
    } catch (error) {
      res.status(500).json({ message: 'Erreur lors de la suppression du document' });
    }
  }
}

class MessagesRoutes implements Route {
  public path = '/messages'; // This will be prefixed by /api in server.ts
  public router = Router();
  private messagesController = new MessagesController(); // Instantiate when controller methods are ready

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // Placeholder for actual routes that will call controller methods
    // Example: this.router.get(`/inbox`, this.messagesController.getInbox);
    // Example: this.router.get(`/sent`, this.messagesController.getSentMessages);
    // Example: this.router.post(`/`, this.messagesController.sendMessage);
    // Example: this.router.patch(`/:id/read`, this.messagesController.markAsRead);
    // Example: this.router.delete(`/:id`, this.messagesController.deleteMessage);

    // Test route
    this.router.get(`${this.path}/test`, (req, res) => {
      res.json({ message: 'Messages route test in routes.ts successful!' });
    });
  }
}

class WeaponsRoutes implements Route {
  public path = '/weapons'; // Base path for weapons
  public router = Router();
  private weaponsController = new WeaponsController();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/types`, this.weaponsController.getWeaponTypes);
    this.router.get(`${this.path}/brands`, this.weaponsController.getWeaponBrands);
    this.router.get(`${this.path}/calibers`, this.weaponsController.getWeaponCalibers);
    
    // Test route for weapons
    this.router.get(`${this.path}/test`, (req, res) => {
      res.json({ message: 'Weapons route test successful!' });
    });
  }
}

// Routes pour les documents des chasseurs
class HunterDocumentsRoutes implements Route {
  public path = '/hunter-documents';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // Récupérer les documents d'un chasseur
    this.router.get(
      '/:hunterId',
      authenticateToken,
      checkRole([ROLES.ADMIN, ROLES.AGENT, ROLES.HUNTER]),
      new HunterDocumentsController().getHunterDocuments
    );

    // Télécharger un document
    this.router.get(
      '/download/:documentId',
      authenticateToken,
      checkRole([ROLES.ADMIN, ROLES.AGENT, ROLES.HUNTER]),
      new HunterDocumentsController().downloadDocument
    );

    // Uploader un document
    this.router.post(
      '/upload',
      authenticateToken,
      checkRole([ROLES.ADMIN, ROLES.AGENT, ROLES.HUNTER]),
      upload.single('document'),
      handleMulterError,
      (req: any, res: any, next: any) => {
        if (!req.file) {
          return res.status(400).json({ message: 'Aucun fichier téléchargé' });
        }
        next();
      },
      new HunterDocumentsController().uploadDocument
    );

    // Supprimer un document
    this.router.delete(
      '/:documentId',
      authenticateToken,
      checkRole([ROLES.ADMIN, ROLES.AGENT, ROLES.HUNTER]),
      new HunterDocumentsController().deleteDocument
    );
  }
}

const messagesRoutes = new MessagesRoutes();
const weaponsRoutes = new WeaponsRoutes();
const hunterDocumentsRoutes = new HunterDocumentsRoutes();

export const routes: Route[] = [
  messagesRoutes,
  weaponsRoutes,
  hunterDocumentsRoutes,
];
