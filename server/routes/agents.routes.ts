import { Router } from 'express';
import { createAgent, deleteAgent, listAgents, updateAgent, upsertAgentByUser } from '../controllers/agents.controller.js';
import { isAuthenticated, isSuperAdmin } from './middlewares/auth.middleware.js';

const router = Router();

router.use(isAuthenticated);
router.use(isSuperAdmin);

router.post('/', createAgent);
router.get('/', listAgents);
router.put('/by-user/:userId', upsertAgentByUser);
router.put('/:idAgent', updateAgent);
router.delete('/:idAgent', deleteAgent);

export default router;
