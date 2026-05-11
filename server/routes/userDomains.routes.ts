import { Router } from 'express';
import {
    createUserDomain,
    deleteUserDomain,
    deleteUserDomainByUserAndDomain,
    getUserDomainById,
    getUserDomainsByUser,
    listUserDomains,
    setUserDomainActiveByUserAndDomain,
    updateUserDomain,
} from '../controllers/userDomains.controller.js';
import { isAdmin, isAuthenticated } from './middlewares/auth.middleware.js';
import { checkDomain } from './middlewares/domain.middleware.js';

const router = Router();

// Toutes les routes ci-dessous nécessitent authentification + rôle admin + domaine valide (via X-Domain)
router.use(isAuthenticated, isAdmin, checkDomain());

// GET /api/user-domains?userId=123
router.get('/', listUserDomains);

// GET /api/user-domains/user/:userId
router.get('/user/:userId', getUserDomainsByUser);

// GET /api/user-domains/:id
router.get('/:id', getUserDomainById);

// POST /api/user-domains
router.post('/', createUserDomain);

// PUT /api/user-domains/:id
router.put('/:id', updateUserDomain);

// DELETE /api/user-domains/:id
router.delete('/:id', deleteUserDomain);

// PUT /api/user-domains/user/:userId/domain/:domain/active/:active
router.put('/user/:userId/domain/:domain/active/:active', setUserDomainActiveByUserAndDomain);

// DELETE /api/user-domains/user/:userId/domain/:domain
router.delete('/user/:userId/domain/:domain', deleteUserDomainByUserAndDomain);

export default router;
