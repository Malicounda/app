import { Router } from 'express';
import { checkEmail, checkUsername, getMe, heartbeat, login, logout, register, verifyPassword, getActiveSessions } from '../controllers/auth.controller.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// Routes d'authentification
router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.get('/heartbeat', isAuthenticated, heartbeat);
router.get('/me', isAuthenticated, getMe);
// Public checks for availability
router.get('/check-username', checkUsername);
router.get('/check-email', checkEmail);

// Route nécessitant d'être connecté
router.post('/verify-password', isAuthenticated, verifyPassword);

// Historique des sessions (Audit APK)
router.get('/active-sessions', isAuthenticated, getActiveSessions);

export default router;
