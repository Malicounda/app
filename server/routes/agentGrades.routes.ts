import { Router } from 'express';
import { createAgentGrade, deleteAgentGrade, listAgentGrades, updateAgentGrade } from '../controllers/agentGrades.controller.js';
import { isAdmin, isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

router.use(isAuthenticated);
router.get('/', isAdmin, listAgentGrades);
router.post('/', isAdmin, createAgentGrade);
router.put('/:id', isAdmin, updateAgentGrade);
router.delete('/:id', isAdmin, deleteAgentGrade);

export default router;
