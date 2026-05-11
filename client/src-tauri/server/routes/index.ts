import { Express, Router } from 'express';
import authRoutes from './auth.routes.js';
import hunterRoutes from './hunters.routes.js';
import permitRoutes from './permits.routes.js';
import messageRoutes from './messages.routes.js';
import guideRoutes from './guides.routes.js';
import userRoutes from './users.routes.js';
import settingRoutes from './settings.routes.js';
import historyRoutes from './history.routes.js';
import statsRoutes from './stats.routes.js';
import permitRequestsRoutes from './permit-requests.routes.js';
import hunterAttachmentsRoutes from './hunterAttachments.routes.js';
import alertRoutes from './alerts.routes.js';
import regionsRoutes from './regions.routes.js';
import taxesRoutes from './taxes.routes.js';
import speciesRoutes from './species.routes.js';
import permitCategoriesRoutes from './permitCategories.routes.js';
import huntingReportsRoutes from './huntingReports.routes.js';
import guideHunterAssociationsRoutes from './guide-hunter-associations.routes.js';
import declarationEspecesRoutes from './declaration-especes.routes.js';
import huntingActivitiesRoutes from './hunting-activities.routes.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { isAgent } from '../src/middleware/roles.js';
import { getMySectorAgents } from '../controllers/regional.controller.js';
import {
  getRegionStatuses,
  getRegionsGeoJSONFromDB,
  getDepartementStatuses,
  getCommuneStatuses,
  getArrondissementStatuses,
  putRegionStatus,
  putRegionStatusByParam,
  putDepartementStatus,
  putCommuneStatus,
  putArrondissementStatus,
} from '../controllers/statuses.controller.js';
import weaponsRoutes from './weapons.routes.js';

export default function registerRoutes(app: Express): void {
  // Routes d'authentification
  app.use('/api/auth', authRoutes);
  
  // Routes pour les chasseurs
  app.use('/api/hunters', hunterRoutes);
  // Routes alias pour le proxy Vite (développement uniquement)
  if (process.env.NODE_ENV === 'development') {
    app.use('/hunters', hunterRoutes);
  }
  
  // Routes pour les permis de chasse
  app.use('/api/permits', permitRoutes);
  // Routes alias pour le proxy Vite (développement uniquement)
  if (process.env.NODE_ENV === 'development') {
    app.use('/permits', permitRoutes);
  }
  
  // Routes pour la messagerie
  app.use('/api/messages', messageRoutes);
  
  // Routes pour les alertes
  app.use('/api/alerts', alertRoutes);

  // Routes pour les taxes
  app.use('/api/taxes', taxesRoutes);
  
  // Routes pour les espèces
  app.use('/api/species', speciesRoutes);

  // Routes pour les catégories de permis et leurs tarifs
  app.use('/api/permit-categories', permitCategoriesRoutes);

  // Routes pour les rapports d'abattage (déclarations d'espèces)
  app.use('/api/hunting-reports', huntingReportsRoutes);
  
  // Routes pour les guides de chasse
  app.use('/api/guides', guideRoutes);
  
  // Routes pour les associations guide-chasseur
  app.use('/api/guide-hunter-associations', guideHunterAssociationsRoutes);
  
  // Routes pour les déclarations d'espèces
  app.use('/api/declaration-especes', declarationEspecesRoutes);
  
  // Routes pour les activités de chasse (unifiées)
  app.use('/api/hunting-activities', huntingActivitiesRoutes);
  
  // Routes pour la gestion des utilisateurs
  app.use('/api/users', userRoutes);
  
  // Routes pour les paramètres de l'application
  app.use('/api/settings', settingRoutes);
  
  // Routes pour l'historique des actions
  app.use('/api/history', historyRoutes);
  
  // Routes pour les statistiques
  app.use('/api/stats', statsRoutes);
  // Routes alias pour le proxy Vite (développement uniquement)
  if (process.env.NODE_ENV === 'development') {
    app.use('/stats', statsRoutes);
  }
  
  // Routes pour les demandes de permis
  app.use('/api/permit-requests', permitRequestsRoutes);

  // Routes pour les pièces jointes par chasseur (1 ligne par chasseur)
  app.use('/api', hunterAttachmentsRoutes);
  
  // Routes pour les régions et départements (maintenues sous /api)
  app.use('/api', regionsRoutes);

  // Routes pour les armes (types, marques, calibres)
  app.use('/api/weapons', weaponsRoutes);

  // Routes spécifiques pour les agents régionaux
  const regionalRouter = Router();
  regionalRouter.get('/my-sector-agents', isAuthenticated, isAgent, getMySectorAgents);
  app.use('/api/regional', regionalRouter);

  // Routes pour les statuts (ex: statuts des régions)
  // On crée un mini-routeur ici pour la propreté, mais on pourrait aussi l'externaliser
  const statusRouter = Router();
  // READ
  statusRouter.get('/statuses/regions', isAuthenticated, getRegionStatuses);
  statusRouter.get('/statuses/regions-geojson', isAuthenticated, getRegionsGeoJSONFromDB);
  statusRouter.get('/statuses/departements', isAuthenticated, getDepartementStatuses);
  statusRouter.get('/statuses/communes', isAuthenticated, getCommuneStatuses);
  statusRouter.get('/statuses/arrondissements', isAuthenticated, getArrondissementStatuses);
  // UPDATE
  statusRouter.put('/regions/statuses', isAuthenticated, putRegionStatus);
  statusRouter.put('/statuses/regions/:idOrName', isAuthenticated, putRegionStatusByParam);
  statusRouter.put('/statuses/departements/:id', isAuthenticated, putDepartementStatus);
  statusRouter.put('/statuses/communes/:id', isAuthenticated, putCommuneStatus);
  statusRouter.put('/statuses/arrondissements/:id', isAuthenticated, putArrondissementStatus);
  app.use('/api', statusRouter);
  
  // Gestion des erreurs 404 pour les routes non trouvées
  app.use((req, res) => {
    res.status(404).json({ message: "Route non trouvée" });
  });
  
  // Gestion des erreurs globales
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Erreur non gérée:", err);
    res.status(500).json({
      message: "Une erreur interne est survenue",
      error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
  });
}


