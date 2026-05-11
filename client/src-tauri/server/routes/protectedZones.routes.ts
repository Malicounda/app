import express from 'express';
import { getAllProtectedZonesAsGeoJSON, deleteProtectedZone, updateProtectedZone } from '../controllers/protectedZones.controller.js';
import { isAuthenticated, isAdmin } from './middlewares/auth.middleware.js';

const router = express.Router();

// GET /api/protected-zones (public)
router.get('/', getAllProtectedZonesAsGeoJSON);

// DELETE /api/protected-zones/:id (admin only)
router.delete('/:id', isAuthenticated, isAdmin, deleteProtectedZone);

// PUT /api/protected-zones/:id (admin only)
router.put('/:id', isAuthenticated, isAdmin, updateProtectedZone);

export default router;
