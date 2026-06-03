import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { uploadAttachment, downloadAttachment, deleteAttachment, getAttachmentsStatus } from '../controllers/hunterAttachments.controller.js';
import { getUploadsDir } from '../lib/uploadsPath.js';
import { persistMessageAttachment } from '../lib/messageAttachmentStorage.js';

const router = express.Router();

// Multer en mémoire pour écrire directement en BLOB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(isAuthenticated);

// Upload d'un chunk pour l'architecture offline-first
router.post('/attachments/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex: chunkIndexRaw, totalChunks: totalChunksRaw, chunkHash } = req.body;
    const file = req.file;

    if (!uploadId || chunkIndexRaw === undefined || totalChunksRaw === undefined || !chunkHash || !file) {
      return res.status(400).json({ message: 'Paramètres de chunk invalides' });
    }

    const chunkIndex = parseInt(chunkIndexRaw, 10);
    const totalChunks = parseInt(totalChunksRaw, 10);

    // 1. Recalculer le SHA-256 du chunk reçu
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    if (sha256 !== chunkHash) {
      console.warn(`[chunk-upload] Hash mismatch for chunk ${chunkIndex} of uploadId ${uploadId}`);
      return res.status(422).json({ message: 'Hash du chunk incorrect (422 Unprocessable Entity)' });
    }

    // 2. Dossier de stockage temporaire des chunks pour cet uploadId
    const uploadsDir = getUploadsDir();
    const tempDir = path.join(uploadsDir, 'temp-chunks', uploadId);
    fs.mkdirSync(tempDir, { recursive: true });

    // Écrire le chunk
    const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
    fs.writeFileSync(chunkPath, file.buffer);

    console.log(`[chunk-upload] Received chunk ${chunkIndex + 1}/${totalChunks} for ${uploadId}`);

    // 3. Si c'est le dernier chunk, réassembler le fichier
    if (chunkIndex === totalChunks - 1) {
      const chunksBuffers: Buffer[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const p = path.join(tempDir, `chunk-${i}`);
        if (!fs.existsSync(p)) {
          return res.status(400).json({ message: `Le chunk ${i} est manquant pour finaliser l'assemblage.` });
        }
        chunksBuffers.push(fs.readFileSync(p));
      }

      const mergedBuffer = Buffer.concat(chunksBuffers);
      console.log(`[chunk-upload] Merging ${totalChunks} chunks for ${uploadId}, total size: ${mergedBuffer.length} bytes`);

      // Sauvegarder via persistMessageAttachment en utilisant uploadId comme clé de stockage unique
      const persisted = await persistMessageAttachment({
        buffer: mergedBuffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storageKey: uploadId
      });

      // Nettoyer les chunks temporaires
      try {
        for (let i = 0; i < totalChunks; i++) {
          fs.unlinkSync(path.join(tempDir, `chunk-${i}`));
        }
        fs.rmdirSync(tempDir);
        // Supprimer aussi le dossier parent temp-chunks si vide
        const parentTempDir = path.join(uploadsDir, 'temp-chunks');
        if (fs.readdirSync(parentTempDir).length === 0) {
          fs.rmdirSync(parentTempDir);
        }
      } catch (e) {
        console.warn('[chunk-upload] Erreur lors du nettoyage des chunks temporaires:', e);
      }

      return res.status(200).json({
        message: 'Fichier entièrement assemblé et sauvegardé.',
        key: persisted.key,
        name: persisted.name,
        mime: persisted.mime,
        size: persisted.size
      });
    }

    return res.status(200).json({ message: `Chunk ${chunkIndex} reçu et validé.` });
  } catch (error) {
    console.error('Erreur lors du traitement du chunk:', error);
    return res.status(500).json({ message: 'Erreur serveur lors de l\'upload du chunk' });
  }
});

// Upload d'une pièce jointe pour un chasseur et un type
router.post('/attachments/:hunterId', upload.single('file'), uploadAttachment);

// Téléchargement/aperçu d'une pièce jointe
router.get('/attachments/:hunterId/:documentType', downloadAttachment);

// Suppression d'une pièce jointe pour un type
router.delete('/attachments/:hunterId/:documentType', deleteAttachment);

// Statut synthétique des pièces jointes d'un chasseur
router.get('/attachments/:hunterId', getAttachmentsStatus);

export default router;


