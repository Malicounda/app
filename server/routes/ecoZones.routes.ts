import express from 'express';
import { getAllEcoZonesAsGeoJSON } from '../controllers/ecoZones.controller.js'; // Ajustez le chemin si nécessaire
// import { isAuthenticated } from '../middleware/auth.middleware'; // Décommentez si l'authentification est requise

const router = express.Router();

// Route pour récupérer toutes les zones écogéographiques en format GeoJSON
// Si l'accès doit être protégé, ajoutez le middleware isAuthenticated
// router.get('/', isAuthenticated, getAllEcoZonesAsGeoJSON);
router.get('/', getAllEcoZonesAsGeoJSON);

export default router;
