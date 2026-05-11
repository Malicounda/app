import { Router } from 'express';
import { login, register, logout, getMe, checkUsername, checkEmail } from '../controllers/auth.controller.js';

const router = Router();

// Routes d'authentification
router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.get('/me', getMe);
// Public checks for availability
router.get('/check-username', checkUsername);
router.get('/check-email', checkEmail);

export default router;