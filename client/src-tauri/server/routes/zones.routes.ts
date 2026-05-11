import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getZones, createZone, updateZone, deleteZone, importZones } from '../controllers/zones.controller.js';
// import { isAuthenticated } from '../middleware/auth.middleware';

const router = express.Router();

// Multer: stockage temporaire sur disque pour gros CSV
const tmpDir = path.resolve(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tmpDir)) {
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}
const upload = multer({ dest: tmpDir, limits: { fileSize: 20 * 1024 * 1024 } });

// Multer: stockage permanent pour photos et pièces jointes des zones (conserver l'extension)
const docsDir = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(docsDir)) {
  try { fs.mkdirSync(docsDir, { recursive: true }); } catch {}
}

const sanitize = (name: string) => name.replace(/[^A-Za-z0-9_.-]+/g, '_');
const storageDocs = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docsDir),
  filename: (_req, file, cb) => {
    const original = file.originalname || 'file';
    const ext = path.extname(original) || '';
    const base = path.basename(original, ext);
    const safeBase = sanitize(base).slice(0, 100) || 'file';
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${unique}-${safeBase}${ext}`);
  }
});
const uploadDocs = multer({ storage: storageDocs, limits: { fileSize: 20 * 1024 * 1024 } });

// Liste des zones (FeatureCollection). Filtrage optionnel par type: ?type=zic|amodiee
router.get('/', getZones);

// Création d'une zone (V1: GeoJSON obligatoire)
// Le frontend envoie un FormData (multipart/form-data) sans fichiers.
// On utilise upload.none() pour que Multer parse correctement les champs textuels.
router.post('/', upload.none(), createZone);

// Mise à jour d'une zone (avec upload de photo/attachments)
router.put('/:id', uploadDocs.any(), updateZone);

// Import CSV pour créer une zone polygonale
router.post('/import', upload.single('file'), importZones);

// Suppression d'une zone
router.delete('/:id', deleteZone);

export default router;
