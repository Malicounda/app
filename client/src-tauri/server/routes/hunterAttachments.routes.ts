import express from 'express';
import multer from 'multer';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { uploadAttachment, downloadAttachment, deleteAttachment, getAttachmentsStatus } from '../controllers/hunterAttachments.controller.js';

const router = express.Router();

// Multer en mémoire pour écrire directement en BLOB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(isAuthenticated);

// Upload d'une pièce jointe pour un chasseur et un type
router.post('/attachments/:hunterId', upload.single('file'), uploadAttachment);

// Téléchargement/aperçu d'une pièce jointe
router.get('/attachments/:hunterId/:documentType', downloadAttachment);

// Suppression d'une pièce jointe pour un type
router.delete('/attachments/:hunterId/:documentType', deleteAttachment);

// Statut synthétique des pièces jointes d'un chasseur
router.get('/attachments/:hunterId', getAttachmentsStatus);

export default router;


