import express, { Router, Request, Response, NextFunction } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
// Importer les fonctions du contrôleur
import {
    createAlert,
    getReceivedAlerts,
    getSentAlerts,
    markAsRead,
    markAllAsRead,
    deleteAlert,
    getMapAlerts,
    getUnreadAlertsCount
} from '../controllers/alerts.controller.js';

const router: Router = express.Router();

// Routes pour les alertes utilisant les fonctions importées du contrôleur
router.post('/', isAuthenticated, createAlert);
router.get('/map', isAuthenticated, getMapAlerts);
router.get('/unread-count', isAuthenticated, getUnreadAlertsCount);
router.get('/received/:userId', isAuthenticated, getReceivedAlerts);
router.get('/sent/:userId', isAuthenticated, getSentAlerts);
router.patch('/:alertId/read', isAuthenticated, markAsRead);
router.patch('/read-all', isAuthenticated, markAllAsRead); // Simplifié: s'applique à l'utilisateur authentifié
router.patch('/user/:userId/read-all', isAuthenticated, markAllAsRead); // Route spécifique pour un utilisateur
router.delete('/:alertId', isAuthenticated, deleteAlert);

export default router;