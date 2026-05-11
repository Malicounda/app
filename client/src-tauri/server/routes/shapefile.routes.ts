import { Router } from 'express';
import multer from 'multer';
import { uploadShapefile } from '../controllers/shapefile.controller.js';
import { isAuthenticated, isAdmin } from './middlewares/auth.middleware.js';

const router = Router();

// Configuration de multer pour l'upload de fichiers
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Route pour téléverser un shapefile
router.post(
  '/upload',
  isAuthenticated,
  isAdmin,
  upload.fields([
    { name: 'shp', maxCount: 1 },
    { name: 'shx', maxCount: 1 },
    { name: 'dbf', maxCount: 1 },
    { name: 'prj', maxCount: 1 }
  ]),
  uploadShapefile
);

export default router;
