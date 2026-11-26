import express, { Router, Request, Response, NextFunction } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import multer from 'multer';
import { normalizeOriginalFilename } from '../lib/filenameEncoding.js';
import { readMessageAttachment, guessMimeFromFilename } from '../lib/messageAttachmentStorage.js';

// Importer les fonctions du contrôleur
import {
    createAlert,
    getReceivedAlerts,
    getSentAlerts,
    markAsRead,
    markAllAsRead,
    deleteAlert,
    getMapAlerts,
    getUnreadAlertsCount,
    getAlertRecipients,
    getRecipients
} from '../controllers/alerts.controller.js';

const router: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file?.originalname) {
      file.originalname = normalizeOriginalFilename(file.originalname);
    }
    cb(null, true);
  },
});

const handleAlertAttachmentsUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: "La pièce jointe est trop volumineuse (max 5 Mo)." });
      }
      return res.status(400).json({ message: "Erreur lors du traitement de la pièce jointe", error: err.message });
    } else if (err) {
      return res.status(400).json({ message: "Erreur inattendue lors de l'upload", error: err.message });
    }
    next();
  });
};

// Routes pour les alertes utilisant les fonctions importées du contrôleur
router.post('/', isAuthenticated, handleAlertAttachmentsUpload, createAlert);
router.get('/map', isAuthenticated, getMapAlerts);
router.get('/unread-count', isAuthenticated, getUnreadAlertsCount);
router.get('/recipients', isAuthenticated, getRecipients);
router.get('/:alertId/recipients', isAuthenticated, getAlertRecipients);
router.get('/received/:userId', isAuthenticated, getReceivedAlerts);
router.get('/sent/:userId', isAuthenticated, getSentAlerts);
router.patch('/:alertId/read', isAuthenticated, markAsRead);
router.patch('/read-all', isAuthenticated, markAllAsRead); // Simplifié: s'applique à l'utilisateur authentifié
router.patch('/user/:userId/read-all', isAuthenticated, markAllAsRead); // Route spécifique pour un utilisateur
router.delete('/:alertId', isAuthenticated, deleteAlert);

// Route pour télécharger/consommer les pièces jointes (avec support Range pour lecture audio/vidéo)
router.get('/attachment/:key', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const fileData = await readMessageAttachment(key);
    if (!fileData) {
      return res.status(404).json({ message: 'Pièce jointe introuvable' });
    }
    const mime = guessMimeFromFilename(key);
    const totalLength = fileData.buffer.length;
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), totalLength - 1) : totalLength - 1;
        if (start <= end && start < totalLength) {
          const chunk = fileData.buffer.subarray(start, end + 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
          res.setHeader('Content-Length', chunk.length);
          return res.send(chunk);
        }
      }
    }

    res.setHeader('Content-Length', totalLength);
    return res.send(fileData.buffer);
  } catch (error) {
    console.error('Erreur lors du téléchargement de la pièce jointe de l\'alerte:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

export default router;