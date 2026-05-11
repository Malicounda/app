import express from 'express';
import * as infractionsController from '../controllers/infractions.controller.js';
import { isAdmin, isAdminOrAgent } from '../src/middleware/roles.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = express.Router();

// Route publique pour la résolution des zones administratives
router.get('/resolve-areas', infractionsController.resolveAreas);
router.get('/test-resolve', (req, res) => {
  res.json({ message: 'Endpoint resolve-areas accessible', timestamp: new Date().toISOString() });
});

// Middleware d'authentification pour toutes les autres routes
router.use(isAuthenticated);

// =====================================================
// 📋 ROUTES CODES D'INFRACTIONS
// =====================================================
router.get('/codes', infractionsController.getCodesInfractions);
router.post('/codes', isAdmin, infractionsController.createCodeInfraction);
router.put('/codes/:id', isAdmin, infractionsController.updateCodeInfraction);
router.delete('/codes/:id', isAdmin, infractionsController.deleteCodeInfraction);

// =====================================================
// 📋 ROUTES CODE ITEMS (nature/article par code)
// =====================================================
router.get('/codes/items', infractionsController.getCodeInfractionItems);
router.get('/codes/:codeId/items', infractionsController.getCodeInfractionItems);
router.post('/codes/:codeId/items', isAdmin, infractionsController.createCodeInfractionItem);
router.put('/codes/items/:id', isAdmin, infractionsController.updateCodeInfractionItem);
router.delete('/codes/items/:id', isAdmin, infractionsController.deleteCodeInfractionItem);
router.patch('/codes/items/:id/default', isAdmin, infractionsController.setDefaultCodeInfractionItem);

// =====================================================
// 🔧 ROUTES UNITÉS + CONFIGURATION PAR ITEM
// =====================================================
router.get('/units', infractionsController.getUnits);
router.post('/units', isAdmin, infractionsController.createUnit);
router.put('/units/:id', isAdmin, infractionsController.updateUnit);
router.delete('/units/:id', isAdmin, infractionsController.deleteUnit);

router.get('/codes/items/:id/units-config', infractionsController.getItemUnitsConfig);
router.put('/codes/items/:id/units-config', isAdmin, infractionsController.putItemUnitsConfig);

// =====================================================
// 🧾 ROUTES SAISIE ITEMS (observations)
// =====================================================
router.get('/saisie-items', infractionsController.getSaisieItems);
router.post('/saisie-items', isAdmin, infractionsController.createSaisieItem);
router.put('/saisie-items/:id', isAdmin, infractionsController.updateSaisieItem);
router.delete('/saisie-items/:id', isAdmin, infractionsController.deleteSaisieItem);

router.get('/saisie-groups', infractionsController.getSaisieGroups);
router.post('/saisie-groups', isAdmin, infractionsController.createSaisieGroup);
router.put('/saisie-groups/:key', isAdmin, infractionsController.updateSaisieGroup);
router.delete('/saisie-groups/:key', isAdmin, infractionsController.deleteSaisieGroup);

// =====================================================
// 📎 ROUTES DOCUMENTS DES CODES
// =====================================================
// Route pour servir un fichier (doit être avant les routes avec paramètres génériques)
router.get('/codes/documents/:docId/file', infractionsController.serveCodeDocument);
router.get('/codes/:codeId/documents', infractionsController.getCodeDocuments);
router.post(
  '/codes/:codeId/documents',
  isAdmin,
  infractionsController.upload.array('files'),
  infractionsController.uploadCodeDocuments
);
router.delete('/codes/documents/:docId', isAdmin, infractionsController.deleteCodeDocument);

// =====================================================
// 📦 IMPORT EN LOT CODES/ITEMS
// =====================================================
router.post('/codes/import', isAdmin, infractionsController.importCodesAndItems);

// =====================================================
// 👮 ROUTES AGENTS VERBALISATEURS
// =====================================================
router.get('/agents', infractionsController.getAgentsVerbalisateurs);
router.post('/agents', isAdminOrAgent, infractionsController.upload.none(), infractionsController.createAgentVerbalisateur);
router.put('/agents/:id', isAdminOrAgent, infractionsController.upload.none(), infractionsController.updateAgentVerbalisateur);
router.delete('/agents/:id', isAdminOrAgent, infractionsController.deleteAgentVerbalisateur);

// =====================================================
// 👤 ROUTES CONTREVENANTS
// =====================================================
router.get('/contrevenants', infractionsController.getContrevenants);
router.get('/contrevenants/check', infractionsController.checkContrevenantByNumero);
router.get('/contrevenants/:id', infractionsController.getContrevenantDetails);
router.get('/contrevenants/:id/photo', infractionsController.getContrevenantPhoto);
router.get('/contrevenants/:id/piece-identite', infractionsController.getContrevenantPieceIdentite);
router.post(
  '/contrevenants',
  isAdminOrAgent,
  infractionsController.upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'piece_identite', maxCount: 1 },
    { name: 'donnees_biometriques', maxCount: 1 }
  ]),
  infractionsController.createContrevenant
);
router.put(
  '/contrevenants/:id',
  isAdminOrAgent,
  infractionsController.upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'piece_identite', maxCount: 1 },
    { name: 'donnees_biometriques', maxCount: 1 }
  ]),
  infractionsController.updateContrevenant
);
router.delete('/contrevenants/:id', isAdminOrAgent, infractionsController.deleteContrevenant);

// =====================================================
// 🚨 ROUTES INFRACTIONS
// =====================================================
router.get('/infractions', infractionsController.getInfractions);
router.post(
  '/infractions',
  isAdminOrAgent,
  infractionsController.upload.fields([
    { name: 'photo_quittance', maxCount: 1 },
    { name: 'photo_infraction', maxCount: 1 }
  ]),
  infractionsController.createInfraction
);
router.put(
  '/infractions/:id',
  isAdminOrAgent,
  infractionsController.upload.fields([
    { name: 'photo_quittance', maxCount: 1 },
    { name: 'photo_infraction', maxCount: 1 }
  ]),
  infractionsController.updateInfraction
);
router.delete('/infractions/:id', isAdminOrAgent, infractionsController.deleteInfraction);

// =====================================================
// 📄 ROUTES PROCÈS-VERBAUX
// =====================================================
router.get('/pv', infractionsController.getProcesVerbaux);
router.post(
  '/pv',
  isAdminOrAgent,
  infractionsController.upload.fields([
    { name: 'fichier_pv', maxCount: 1 },
  ]),
  infractionsController.createProcesVerbal
);
router.delete('/pv/:id', isAdminOrAgent, infractionsController.deleteProcesVerbal);

// =====================================================
// 📄 ROUTES FICHIERS ET MÉDIAS
// =====================================================
router.get('/pv/:id/file', infractionsController.getPvFile);
router.get('/infractions/:id/photo-infraction', infractionsController.getInfractionPhoto);
router.get('/infractions/:id/photo-quittance', infractionsController.getInfractionQuittance);

// =====================================================
// 📊 ROUTES STATISTIQUES
// =====================================================
router.get('/stats', infractionsController.getStatistiques);

export default router;
