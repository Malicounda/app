import express, { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { createHuntingReport, getHuntingReports, getHuntingReportPhoto } from '../controllers/huntingReports.controller.js';
import multer from 'multer';

const router: Router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Créer une nouvelle déclaration d'abattage (accepte multipart/form-data avec champ 'photo')
router.post('/', isAuthenticated, upload.single('photo'), createHuntingReport);

// Lister les déclarations de l'utilisateur (auth) ou via ?userId=
router.get('/', isAuthenticated, getHuntingReports);

// Récupérer la photo d'une déclaration
router.get('/:id/photo', isAuthenticated, getHuntingReportPhoto);

export default router;
