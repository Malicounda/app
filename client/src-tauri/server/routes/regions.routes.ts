import { Router } from 'express';
import { getDepartements, getRegions } from '../controllers/regions.controller.js';
import { detectRegionFromPoint, detectDepartementFromPoint } from '../controllers/statuses.controller.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';


const router = Router();

// Routes pour les régions et départements
// Ces routes pourraient être protégées par authentification si nécessaire
router.get('/regions', isAuthenticated, getRegions);
router.get('/departements', isAuthenticated, getDepartements);

// Routes pour détecter la région/département à partir de coordonnées (PostGIS)
router.get('/regions/detect-from-point', isAuthenticated, detectRegionFromPoint);
router.get('/departements/detect-from-point', isAuthenticated, detectDepartementFromPoint);

export default router;
