import express from 'express';
import { getAllProtectedZonesAsGeoJSON, deleteProtectedZone, updateProtectedZone, getProtectedZonesCounts } from '../controllers/protectedZones.controller.js';
import { isAuthenticated, isAdmin } from './middlewares/auth.middleware.js';

const router = express.Router();

// GET /api/protected-zones (authenticated: needed for regional filtering)
router.get('/', isAuthenticated, getAllProtectedZonesAsGeoJSON);

// GET /api/protected-zones/counts (lightweight counters)
router.get('/counts', getProtectedZonesCounts);

// DELETE /api/protected-zones/:id (admin only)
router.delete('/:id', isAuthenticated, isAdmin, deleteProtectedZone);

// PUT /api/protected-zones/:id (admin only)
router.put('/:id', isAuthenticated, isAdmin, updateProtectedZone);

export default router;
