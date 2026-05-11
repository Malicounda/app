import { Router } from 'express';
import {
    createRoleMetier,
    deactivateRoleMetier,
    deleteRoleMetier,
    getDefaultRoleMetier,
    getRoleMetierById,
    listRolesMetier,
    setRoleMetierActive,
    setRoleMetierDefault,
    setRoleMetierSupervisor,
    updateRoleMetier,
} from '../controllers/rolesMetier.controller.js';
import { isAdmin, isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

router.use(isAuthenticated);

// Liste (admin) - on garde simple: table de référence interne
router.get('/', isAdmin, listRolesMetier);
router.get('/:id', isAdmin, getRoleMetierById);
router.post('/', isAdmin, createRoleMetier);
router.put('/:id', isAdmin, updateRoleMetier);
router.patch('/:id/active', isAdmin, setRoleMetierActive);
router.patch('/:id/default', isAdmin, setRoleMetierDefault);
router.patch('/:id/supervisor', isAdmin, setRoleMetierSupervisor);
router.get('/default', isAdmin, getDefaultRoleMetier);
router.delete('/:id/hard', isAdmin, deleteRoleMetier);
router.delete('/:id', isAdmin, deactivateRoleMetier);

export default router;
