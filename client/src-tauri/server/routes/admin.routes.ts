import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { storage } from '../storage.js';

const router = Router();

// Récupérer tous les profils chasseurs
router.get('/hunter-profiles', isAuthenticated, isAdminAgentOrSubAgent, async (req, res) => {
  // Not implemented yet in storage; stub to keep build green
  return res.status(501).json({ message: 'Non implémenté' });
});

// Associer un profil chasseur à un utilisateur
router.post('/link-hunter-profile', isAuthenticated, isAdminAgentOrSubAgent, async (req, res) => {
  // Not implemented yet in storage; stub to keep build green
  return res.status(501).json({ message: 'Non implémenté' });
});

export default router;
