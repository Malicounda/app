import type { Request, Response } from 'express';
import { storage } from '../storage.js';

// NOTE: le middleware checkDomain('REBOISEMENT') sera appliqué au niveau des routes

export async function getPepinieresMap(req: Request, res: Response) {
  try {
    const rows = await storage.getPepinieresForMap();
    res.json(rows ?? []);
  } catch (err) {
    console.error('[reboisement.controller] getPepinieresMap failed', err);
    res.status(500).json({ message: 'Erreur lors du chargement des pépinières' });
  }
}

export async function getReforestationZonesMap(req: Request, res: Response) {
  try {
    const rows = await storage.getReforestationZonesForMap();
    res.json(rows ?? []);
  } catch (err) {
    console.error('[reboisement.controller] getReforestationZonesMap failed', err);
    res.status(500).json({ message: 'Erreur lors du chargement des zones reboisées' });
  }
}

export async function getRegionalReforestationStats(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    let region = req.query.region as string | undefined;

    // Si l'utilisateur n'est pas admin, on force sa région
    if (currentUser?.role !== 'admin') {
      region = currentUser?.region;
      if (!region) return res.status(400).json({ message: 'Région non définie pour cet agent' });
    } else {
      // Pour l'admin, si la région est vide/null/undefined, c'est la vue nationale
      if (!region || region === "null" || region === "undefined") {
        region = undefined;
      }
    }

    const stats = await storage.getRegionalReforestationStats(region);
    res.json(stats);
  } catch (err) {
    console.error('[reboisement.controller] getRegionalReforestationStats failed', err);
    res.status(500).json({ message: 'Erreur lors du calcul des statistiques' });
  }
}

export async function getMySectorAgentsByDomain(req: Request, res: Response) {
  try {
    const region = req.user?.region;
    if (!region) return res.status(400).json({ message: 'Région non définie' });
    const agents = await storage.getMySectorAgentsByDomain(region, 'REBOISEMENT');
    res.json(agents);
  } catch (err) {
    console.error('[reboisement.controller] getMySectorAgentsByDomain failed', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des agents' });
  }
}

export async function getReforestationActivities(req: Request, res: Response) {
  try {
    const region = req.user?.region;
    if (!region) return res.status(400).json({ message: 'Région non définie' });
    const activities = await storage.getReforestationActivities(region);
    res.json(activities);
  } catch (err) {
    console.error('[reboisement.controller] getReforestationActivities failed', err);
    res.status(500).json({ message: 'Erreur lors du chargement des activités' });
  }
}

export async function createCNRReport(req: Request, res: Response) {
  try {
    const { report, production, plants, species, field } = req.body;
    const userId = (req as any).user.id;

    // Vérifier si un rapport existe déjà pour cette période (uniquement lors de la création)
    if (!report.id) {
      const alreadyExists = await storage.checkReforestationReportExists(userId, report.period);
      if (alreadyExists) {
        return res.status(400).json({
          message: `Un rapport pour la période "${report.period}" existe déjà. Vous devez modifier le rapport existant au lieu d'en créer un nouveau.`
        });
      }
    }

    const newReport = await storage.createReforestationReport(
      { ...report, createdBy: userId },
      production || [],
      plants || [],
      species || [],
      field || []
    );

    // Historique Reboisement
    try {
      await storage.createHistory({
        userId,
        operation: 'create',
        entityType: 'reboisement',
        entityId: (newReport as any)?.id ?? 0,
        details: `Rapport CNR créé pour la période "${report.period || ''}"`,
      });
    } catch {}

    res.status(201).json(newReport);
  } catch (err) {
    console.error('[createCNRReport] error:', err);
    res.status(500).json({ message: 'Erreur lors de la création du rapport' });
  }
}

export async function getCNRReports(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    if (!currentUser) return res.status(401).json({ message: 'Non authentifié' });

    const filters: any = { ...req.query };

    // Enforce visibility rules
    if (currentUser.role === 'admin') {
      // Admin can see everything, use filters from query if any
    } else if (currentUser.role === 'agent') {
      // Regional Agent sees everything in their region
      filters.region = currentUser.region;
    } else {
      // Sector Agents see only their own reports
      // Wait, let's see if we should also allow them to see reports in their department
      // For now, let's stick to their own or reports where they are createdBy
      filters.createdBy = currentUser.id;
    }

    const reports = await storage.getReforestationReports(filters);
    res.json(reports);
  } catch (err) {
    console.error('[getCNRReports] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des rapports' });
  }
}

export async function getConsolidatedCNRData(req: Request, res: Response) {
  try {
    const { period } = req.query;
    const currentUser = (req as any).user;
    const region = currentUser?.role === 'admin'
      ? (typeof req.query.region === 'string' ? req.query.region : null)
      : (req.user?.region || null);

    console.log(`[Consolidation Request] Period: "${period}", Region: "${region}"`);

    if (!period || typeof period !== 'string') {
      return res.status(400).json({ message: 'Période manquante ou invalide' });
    }

    if (currentUser?.role === 'admin' && !region) {
      const data = await (storage as any).getConsolidatedNationalReforestationData(period) || { production: [], plants: [], species: [], field: [] };
      console.log(`[Consolidation Result] Found for NATIONAL:`, {
        production: data.production?.length || 0,
        plants: data.plants?.length || 0,
        field: data.field?.length || 0,
      });
      return res.json(data);
    }

    if (!region) {
      return res.status(400).json({ message: 'Région manquante ou non trouvée' });
    }

    const data = await storage.getConsolidatedReforestationData(region, period) || { production: [], plants: [], species: [], field: [] };
    console.log(`[Consolidation Result] Found for ${region}:`, {
      production: data.production?.length || 0,
      plants: data.plants?.length || 0,
      field: data.field?.length || 0,
      depts: Array.from(new Set(data.production?.map((p: any) => p.localite) || []))
    });
    return res.json(data);
  } catch (err) {
    console.error('[getConsolidatedCNRData] error:', err);
    res.status(500).json({ message: 'Erreur lors de la consolidation des données' });
  }
}

export async function getCNRReportDetails(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const details = await storage.getReforestationReportById(id);
    if (!details) return res.status(404).json({ message: 'Rapport non trouvé' });
    res.json(details);
  } catch (err) {
    console.error('[getCNRReportDetails] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des détails' });
  }
}

export async function validateCNRReport(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body; // 'valide' or 'rejete'
    const currentUser = (req as any).user;

    if (!currentUser) return res.status(401).json({ message: 'Non authentifié' });

    const report = await storage.getReforestationReportById(id);
    if (!report) return res.status(404).json({ message: 'Rapport non trouvé' });

    // Logique de permission
    let canValidate = false;
    if (currentUser.role === 'admin') {
      // Admin peut tout valider, mais on cible surtout les rapports de niveau 'region'
      canValidate = true;
    } else if (currentUser.role === 'agent') {
      // Agent Régional peut valider les rapports de sa région qui sont de niveau inférieur (departement/secteur)
      if (report.region === currentUser.region && report.level !== 'region') {
        canValidate = true;
      }
    }

    if (!canValidate) {
      return res.status(403).json({ message: 'Vous n\'avez pas la permission de valider ou invalider ce rapport' });
    }

    const updated = await storage.updateReforestationReportStatus(id, status);

    // Historique Reboisement
    try {
      await storage.createHistory({
        userId: currentUser.id,
        operation: 'update',
        entityType: 'reboisement',
        entityId: id,
        details: `Rapport CNR #${id} ${status === 'valide' ? 'validé' : 'rejeté'}`,
      });
    } catch {}

    res.json(updated);
  } catch (err) {
    console.error('[validateCNRReport] error:', err);
    res.status(500).json({ message: 'Erreur lors de la validation du rapport' });
  }
}

export async function deleteCNRReport(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const currentUser = (req as any).user;

    if (!currentUser) return res.status(401).json({ message: 'Non authentifié' });

    const report = await storage.getReforestationReportById(id);
    if (!report) return res.status(404).json({ message: 'Rapport non trouvé' });

    // Vérifier si c'est le créateur
    if (report.createdBy !== currentUser.id) {
      return res.status(403).json({ message: 'Seul le créateur peut supprimer ce rapport' });
    }

    // Vérifier le statut (uniquement brouillon ou rejeté)
    if (report.status !== 'brouillon' && report.status !== 'rejete') {
      return res.status(400).json({ message: 'Impossible de supprimer un rapport déjà soumis ou validé' });
    }

    const ok = await storage.deleteReforestationReport(id);
    if (!ok) return res.status(500).json({ message: 'Erreur lors de la suppression' });

    // Historique Reboisement
    try {
      await storage.createHistory({
        userId: currentUser.id,
        operation: 'delete',
        entityType: 'reboisement',
        entityId: id,
        details: `Rapport CNR #${id} supprimé`,
      });
    } catch {}

    res.json({ success: true });
  } catch (err) {
    console.error('[deleteCNRReport] error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression du rapport' });
  }
}

export async function getLastCNRReport(req: Request, res: Response) {
  try {
    const location = req.query as any as { region: string; departement?: string; arrondissement?: string; commune?: string; };
    const last = await storage.getLastReforestationReport(location);
    res.json(last || {});
  } catch (err) {
    console.error('[getLastCNRReport] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération du dernier rapport' });
  }
}

// --- Catalogue des localités (communes) pour F2 ---

export async function getReforestationLocalites(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const departementParam = req.query.departement as string | undefined;

    const departement = currentUser?.role === 'sub-agent'
      ? currentUser?.departement
      : departementParam;

    if (!departement) {
      return res.status(400).json({ message: 'Département manquant' });
    }

    const rows = await storage.getReforestationLocalites(departement);
    res.json(rows ?? []);
  } catch (err) {
    console.error('[getReforestationLocalites] error:', err);
    res.status(500).json({ message: 'Erreur lors du chargement des localités' });
  }
}

export async function addReforestationLocalite(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const { departement, arrondissement, commune } = req.body || {};

    const finalDepartement = currentUser?.role === 'sub-agent'
      ? currentUser?.departement
      : departement;

    if (!finalDepartement || !commune) {
      return res.status(400).json({ message: 'Département et commune requis' });
    }

    const inserted = await storage.addReforestationLocalite({
      departement: finalDepartement,
      arrondissement: arrondissement || null,
      commune,
      createdBy: currentUser.id,
    } as any);

    try {
      await storage.createHistory({ userId: currentUser.id, operation: 'create', entityType: 'reboisement', entityId: (inserted as any)?.id ?? 0, details: `Localité ajoutée : ${commune} (${finalDepartement})` });
    } catch {}

    res.status(201).json(inserted);
  } catch (err) {
    console.error('[addReforestationLocalite] error:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout de la localité' });
  }
}

export async function deleteReforestationLocalite(req: Request, res: Response) {
  try {
    const currentUser = (req as any).user;
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const ok = await storage.softDeleteReforestationLocalite(id, currentUser.id);
    try {
      await storage.createHistory({ userId: currentUser.id, operation: 'delete', entityType: 'reboisement', entityId: id, details: `Localité #${id} supprimée` });
    } catch {}
    res.json({ success: ok });
  } catch (err) {
    console.error('[deleteReforestationLocalite] error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression de la localité' });
  }
}

// --- Catalogue des espèces ---

export async function getCatalogSpecies(req: Request, res: Response) {
  try {
    const species = await storage.getCatalogSpecies();
    res.json(species);
  } catch (err) {
    console.error('[getCatalogSpecies] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération du catalogue' });
  }
}

export async function addCatalogSpecies(req: Request, res: Response) {
  try {
    const { name, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ message: 'Nom et catégorie requis' });
    }
    const created = await storage.addCatalogSpecies(name, category);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'create', entityType: 'reboisement', entityId: (created as any)?.id ?? 0, details: `Espèce ajoutée au catalogue : ${name} (${category})` });
    } catch {}
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === '23505') { // unique constraint
      return res.status(409).json({ message: `L'espèce "${req.body.name}" existe déjà dans le catalogue.` });
    }
    console.error('[addCatalogSpecies] error:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'espèce' });
  }
}

export async function bulkAddCatalogSpecies(req: Request, res: Response) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Liste d\'espèces requise' });
    }
    const count = await storage.bulkAddCatalogSpecies(items);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'create', entityType: 'reboisement', entityId: 0, details: `Import en masse de ${count} espèce(s) dans le catalogue` });
    } catch {}
    res.json({ inserted: count, total: items.length });
  } catch (err) {
    console.error('[bulkAddCatalogSpecies] error:', err);
    res.status(500).json({ message: 'Erreur lors de l\'import en masse' });
  }
}

export async function deleteCatalogSpecies(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteCatalogSpecies(id);
    if (!ok) return res.status(404).json({ message: 'Espèce non trouvée' });
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'delete', entityType: 'reboisement', entityId: id, details: `Espèce du catalogue #${id} supprimée` });
    } catch {}
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteCatalogSpecies] error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
}

// --- Catégories ---

export async function getCatalogCategories(req: Request, res: Response) {
  try {
    const categories = await storage.getCatalogCategories();
    res.json(categories);
  } catch (err) {
    console.error('[getCatalogCategories] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des catégories' });
  }
}

export async function addCatalogCategory(req: Request, res: Response) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nom de la catégorie requis' });
    const created = await storage.addCatalogCategory(name);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'create', entityType: 'reboisement', entityId: (created as any)?.id ?? 0, details: `Catégorie d'espèce ajoutée : ${name}` });
    } catch {}
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: `La catégorie "${req.body.name}" existe déjà.` });
    }
    console.error('[addCatalogCategory] error:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout de la catégorie' });
  }
}

export async function updateCatalogCategory(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Nouveau nom de catégorie requis' });
    const updated = await storage.updateCatalogCategory(id, name);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'update', entityType: 'reboisement', entityId: id, details: `Catégorie d'espèce #${id} modifiée : ${name}` });
    } catch {}
    res.json(updated);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: `Une catégorie porte déjà le nom "${req.body.name}".` });
    }
    console.error('[updateCatalogCategory] error:', err);
    res.status(500).json({ message: err.message || 'Erreur lors de la mise à jour' });
  }
}

export async function deleteCatalogCategory(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteCatalogCategory(id);
    if (!ok) return res.status(404).json({ message: 'Catégorie non trouvée' });
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'delete', entityType: 'reboisement', entityId: id, details: `Catégorie d'espèce #${id} supprimée` });
    } catch {}
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteCatalogCategory] error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
}

// --- Nursery Types ---

export async function getNurseryTypes(req: Request, res: Response) {
  try {
    const types = await storage.getNurseryTypes();
    res.json(types);
  } catch (err) {
    console.error('[getNurseryTypes] error:', err);
    res.status(500).json({ message: 'Erreur lors de la récupération des types de pépinières' });
  }
}

export async function addNurseryType(req: Request, res: Response) {
  try {
    const { label, departement } = req.body;
    if (!label) return res.status(400).json({ message: 'Libellé requis' });
    const created = await storage.addNurseryType(label, departement);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'create', entityType: 'reboisement', entityId: (created as any)?.id ?? 0, details: `Type de pépinière ajouté : ${label}` });
    } catch {}
    res.status(201).json(created);
  } catch (err: any) {
    console.error('[addNurseryType] error:', err);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du type de pépinière' });
  }
}

export async function updateNurseryType(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { label, departement } = req.body;
    if (!label) return res.status(400).json({ message: 'Libellé requis' });
    const updated = await storage.updateNurseryType(id, label, departement);
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'update', entityType: 'reboisement', entityId: id, details: `Type de pépinière #${id} modifié : ${label}` });
    } catch {}
    res.json(updated);
  } catch (err: any) {
    console.error('[updateNurseryType] error:', err);
    res.status(500).json({ message: 'Erreur lors de la mise à jour' });
  }
}

export async function deleteNurseryType(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteNurseryType(id);
    if (!ok) return res.status(404).json({ message: 'Type de pépinière non trouvé' });
    try {
      const userId = (req as any).user?.id;
      if (userId) await storage.createHistory({ userId, operation: 'delete', entityType: 'reboisement', entityId: id, details: `Type de pépinière #${id} supprimé` });
    } catch {}
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteNurseryType] error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
}
