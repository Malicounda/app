import { Router } from 'express';
import {
    createAffectation,
    deleteAffectation,
    getAffectationById,
    getAffectationsByAgent,
    getAgentNiveauHierarchique,
    listAffectations,
    setAffectationActive,
    updateAffectation,
} from '../controllers/affectations.controller.js';
import {
    setAffectationActiveByUserDomain,
    upsertAffectationByUserDomain,
} from '../controllers/affectationsAdmin.controller.js';
import { isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { isAdmin, isAuthenticated } from './middlewares/auth.middleware.js';

const router: Router = Router();

// Toutes les routes nécessitent une authentification
router.use(isAuthenticated);

// GET /api/affectations - Liste des affectations (filtrable par agentId, domaineId, active)
router.get('/', isAdminAgentOrSubAgent, listAffectations);

// GET /api/affectations/agent/:agentId - Affectations d'un agent spécifique
router.get('/agent/:agentId', isAdminAgentOrSubAgent, getAffectationsByAgent);

// GET /api/affectations/agent/:agentId/niveau - Niveau hiérarchique d'un agent
router.get('/agent/:agentId/niveau', isAdminAgentOrSubAgent, getAgentNiveauHierarchique);

// GET /api/affectations/:id - Détail d'une affectation
router.get('/:id', isAdminAgentOrSubAgent, getAffectationById);

// POST /api/affectations - Créer une nouvelle affectation (admin uniquement)
router.post('/', isAdmin, createAffectation);

// PUT /api/affectations/:id - Mettre à jour une affectation (admin uniquement)
router.put('/:id', isAdmin, updateAffectation);

// PATCH /api/affectations/:id/active/:active - Activer/Désactiver une affectation
router.patch('/:id/active/:active', isAdmin, setAffectationActive);

// --- Admin helpers (via userId+domain) ---
// POST /api/affectations/by-user-domain
router.post('/by-user-domain', isAdmin, upsertAffectationByUserDomain);

// PATCH /api/affectations/by-user-domain/:userId/:domain/active/:active
router.patch('/by-user-domain/:userId/:domain/active/:active', isAdmin, setAffectationActiveByUserDomain);

// DELETE /api/affectations/:id - Supprimer une affectation (admin uniquement)
router.delete('/:id', isAdmin, deleteAffectation);

export default router;
