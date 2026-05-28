import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import {
  getActiveTheme,
  listThemes,
  saveTheme,
  deleteTheme,
} from '../controllers/themes.controller.js';

const router = Router();

// GET /api/themes/active - Récupérer le thème actif (accessible à tous les utilisateurs authentifiés)
router.get('/active', isAuthenticated, getActiveTheme);

// GET /api/themes - Lister tous les thèmes (admin/superadmin)
router.get('/', isAuthenticated, listThemes);

// POST /api/themes - Créer ou mettre à jour un thème (admin/superadmin)
router.post('/', isAuthenticated, saveTheme);

// DELETE /api/themes/:id - Supprimer un thème (admin/superadmin)
router.delete('/:id', isAuthenticated, deleteTheme);

export default router;
