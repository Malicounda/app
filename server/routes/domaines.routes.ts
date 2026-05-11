import { Router } from 'express';
import { createDomaine, deleteDomaine, getResetDataTypes, listActiveDomainesPublic, listDomaines, resetDomaineStats, setDomaineActive, updateDomaine } from '../controllers/domaines.controller.js';
import { isAuthenticated, isSuperAdmin } from './middlewares/auth.middleware.js';

const router = Router();

router.get('/public/active', listActiveDomainesPublic);

router.use(isAuthenticated);
router.use(isSuperAdmin);

router.get('/', listDomaines);
router.get('/reset-data-types', getResetDataTypes);
router.post('/', createDomaine);
router.post('/reset-stats', resetDomaineStats);
router.put('/:id', updateDomaine);
router.patch('/:id/active/:active', setDomaineActive);
router.delete('/:id/hard', deleteDomaine);

export default router;
