import { Router } from 'express';
import {
    addCatalogCategory,
    addCatalogSpecies,
    addNurseryType,
    addReforestationLocalite,
    bulkAddCatalogSpecies,
    createCNRReport,
    deleteCatalogCategory,
    deleteCatalogSpecies,
    deleteCNRReport,
    deleteNurseryType,
    deleteReforestationLocalite,
    getCatalogCategories,
    getCatalogSpecies,
    getCNRReportDetails,
    getCNRReports,
    getConsolidatedCNRData,
    getLastCNRReport,
    getMySectorAgentsByDomain,
    getNurseryTypes,
    getPepinieresMap,
    getReforestationActivities,
    getReforestationLocalites,
    getReforestationZonesMap,
    getRegionalReforestationStats,
    updateCatalogCategory,
    updateNurseryType,
    validateCNRReport
} from '../controllers/reboisement.controller.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { checkDomain } from './middlewares/domain.middleware.js';

const router = Router();

// Middleware de protection
router.use(isAuthenticated, checkDomain('REBOISEMENT'));

// Routes carte
router.get('/pepinieres/map', getPepinieresMap);
router.get('/zones/map', getReforestationZonesMap);

// Dashboard régional
router.get('/stats/regional', getRegionalReforestationStats);
router.get('/regional/my-sector-agents', getMySectorAgentsByDomain);
router.get('/activities', getReforestationActivities);

// Rapports CNR (Quinzaine)
router.post('/reports', createCNRReport);
router.get('/reports', getCNRReports);
router.get('/reports/consolidation', getConsolidatedCNRData);
router.get('/reports/last', getLastCNRReport);
router.get('/reports/:id', getCNRReportDetails);
router.patch('/reports/:id/status', validateCNRReport);
router.delete('/reports/:id', deleteCNRReport);

// Catalogue localités (F2)
router.get('/localites', getReforestationLocalites);
router.post('/localites', addReforestationLocalite);
router.delete('/localites/:id', deleteReforestationLocalite);

// Catalogue des espèces (admin)
router.get('/species-catalog', getCatalogSpecies);
router.post('/species-catalog', addCatalogSpecies);
router.post('/species-catalog/bulk', bulkAddCatalogSpecies);
router.delete('/species-catalog/:id', deleteCatalogSpecies);

// Catégories des espèces (admin)
router.get('/species-categories', getCatalogCategories);
router.post('/species-categories', addCatalogCategory);
router.put('/species-categories/:id', updateCatalogCategory);
router.delete('/species-categories/:id', deleteCatalogCategory);

// Types de pépinières (admin)
router.get('/nursery-types', getNurseryTypes);
router.post('/nursery-types', addNurseryType);
router.put('/nursery-types/:id', updateNurseryType);
router.delete('/nursery-types/:id', deleteNurseryType);

export default router;
