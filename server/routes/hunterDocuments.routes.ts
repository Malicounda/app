import express from 'express';
import multer from 'multer';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { 
  uploadHunterDocument, 
  downloadHunterDocument, 
  deleteHunterDocument, 
  getHunterDocumentsStatus 
} from '../controllers/hunterDocuments.controller.js';

const router = express.Router();

// Multer en mémoire pour écrire directement en BLOB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(isAuthenticated);

// Upload d'une pièce jointe générique
router.post('/hunter-documents/:hunterId', upload.single('file'), uploadHunterDocument);

// Téléchargement/aperçu d'un document
router.get('/hunter-documents/:hunterId/:documentType', downloadHunterDocument);

// Suppression d'un document
router.delete('/hunter-documents/:hunterId/:documentType', deleteHunterDocument);

// Statut des documents du chasseur
router.get('/hunter-documents/:hunterId', getHunterDocumentsStatus);

export default router;
