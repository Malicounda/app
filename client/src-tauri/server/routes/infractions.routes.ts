import express from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { isAdmin } from '../src/middleware/roles.js';
import * as infractionsController from '../controllers/infractions.controller.js';

const router = express.Router();

// Middleware d'authentification pour toutes les routes
router.use(isAuthenticated);

// =====================================================
// 📋 ROUTES CODES D'INFRACTIONS
// =====================================================
router.get('/codes', infractionsController.getCodesInfractions);
router.post('/codes', isAdmin, infractionsController.createCodeInfraction);
router.put('/codes/:id', isAdmin, infractionsController.updateCodeInfraction);
router.delete('/codes/:id', isAdmin, infractionsController.deleteCodeInfraction);

// =====================================================
// 👮 ROUTES AGENTS VERBALISATEURS
// =====================================================
router.get('/agents', infractionsController.getAgentsVerbalisateurs);
router.post(
  '/agents',
  isAdmin,
  infractionsController.upload.single('signature'),
  infractionsController.createAgentVerbalisateur
);
router.put(
  '/agents/:id',
  isAdmin,
  infractionsController.upload.single('signature'),
  infractionsController.updateAgentVerbalisateur
);
router.delete('/agents/:id', isAdmin, infractionsController.deleteAgentVerbalisateur);

// =====================================================
// 👤 ROUTES CONTREVENANTS
// =====================================================
router.get('/contrevenants', infractionsController.getContrevenants);
router.post(
  '/contrevenants',
  isAdmin,
  infractionsController.upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'piece_identite', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'donnees_biometriques', maxCount: 1 }
  ]),
  infractionsController.createContrevenant
);
router.put(
  '/contrevenants/:id',
  isAdmin,
  infractionsController.upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'piece_identite', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'donnees_biometriques', maxCount: 1 }
  ]),
  infractionsController.updateContrevenant
);
router.delete('/contrevenants/:id', isAdmin, infractionsController.deleteContrevenant);

// =====================================================
// 🚨 ROUTES INFRACTIONS
// =====================================================
router.get('/infractions', infractionsController.getInfractions);
router.post(
  '/infractions',
  isAdmin,
  infractionsController.upload.fields([
    { name: 'photo_quittance', maxCount: 1 },
    { name: 'photo_infraction', maxCount: 1 }
  ]),
  infractionsController.createInfraction
);
router.put(
  '/infractions/:id',
  isAdmin,
  infractionsController.upload.fields([
    { name: 'photo_quittance', maxCount: 1 },
    { name: 'photo_infraction', maxCount: 1 }
  ]),
  infractionsController.updateInfraction
);
router.delete('/infractions/:id', isAdmin, infractionsController.deleteInfraction);

// =====================================================
// 📄 ROUTES PROCÈS-VERBAUX
// =====================================================
router.get('/pv', infractionsController.getProcesVerbaux);
router.post(
  '/pv',
  isAdmin,
  infractionsController.upload.fields([
    { name: 'fichier_pv', maxCount: 1 },
    { name: 'piece_jointe', maxCount: 1 }
  ]),
  infractionsController.createProcesVerbal
);
router.delete('/pv/:id', isAdmin, infractionsController.deleteProcesVerbal);

// =====================================================
// 📊 ROUTES STATISTIQUES
// =====================================================
router.get('/stats', infractionsController.getStatistiques);

export default router;
