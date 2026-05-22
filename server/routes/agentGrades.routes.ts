import { Router } from 'express';
import { createAgentGrade, deleteAgentGrade, listAgentGrades } from '../controllers/agentGrades.controller.js';
import { isAdmin, isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

router.use(isAuthenticated);
router.get('/', isAdmin, listAgentGrades);
router.post('/', isAdmin, createAgentGrade);
router.delete('/:id', isAdmin, deleteAgentGrade);

export default router;
