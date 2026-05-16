import { Router } from 'express';
import * as pushController from '../controllers/push.controller.js';

const router = Router();

// Routes pour les abonnements Web Push
router.post('/subscribe', pushController.subscribe);
router.post('/unsubscribe', pushController.unsubscribe);
router.get('/key', pushController.getVapidPublicKey);

export default router;
