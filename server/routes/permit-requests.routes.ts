import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db.js';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { hunters, permits, permitRequests, users, type InsertPermitRequest } from '../../shared/schema.js';


// Fonction simplifiée de validation (les colonnes de documents n'existent pas dans le schéma actuel)
async function validateHunterForPermitRequest(hunterId: number) {
  try {
    const hunter = await db.select().from(hunters).where(eq(hunters.id, hunterId)).limit(1);
    if (hunter.length === 0) {
      return { canCreatePermit: false, missingItems: ['Chasseur non trouvé'], completionPercentage: 0 };
    }
    // Sans colonnes de documents, on considère le dossier comme valide côté backend.
    return { canCreatePermit: true, missingItems: [], completionPercentage: 100 };
  } catch (error) {
    console.error('Erreur lors de la validation du chasseur:', error);
    return { canCreatePermit: false, missingItems: ['Erreur lors de la validation du dossier'], completionPercentage: 0 };
  }
}

// Types pour la réponse de l'API
interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Types pour les paramètres de requête
type RequestParams = {
  hunterId?: string;
  requestId?: string;
  status?: string;
};

import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// Récupérer toutes les demandes de permis (avec infos chasseur et utilisateur)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const requests = await db
      .select({
        id: permitRequests.id,
        userId: permitRequests.userId,
        hunterId: permitRequests.hunterId,
        requestedType: permitRequests.requestedType,
        requestedCategory: permitRequests.requestedCategory,
        region: permitRequests.region,
        status: permitRequests.status,
        referenceNumber: permitRequests.referenceNumber,
        createdAt: permitRequests.createdAt,
        updatedAt: permitRequests.updatedAt,
        // Hunter info
        hunterFirstName: hunters.firstName,
        hunterLastName: hunters.lastName,
        hunterPhone: hunters.phone,
        hunterIdNumber: hunters.idNumber,
        hunterCategory: hunters.category,
        // Requester info
        requesterFirstName: users.firstName,
        requesterLastName: users.lastName,
      })
      .from(permitRequests)
      .leftJoin(hunters, eq(permitRequests.hunterId, hunters.id))
      .leftJoin(users, eq(permitRequests.userId, users.id))
      .orderBy(desc(permitRequests.createdAt));

    res.json(requests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes de permis:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes de permis' });
  }
});

// Route pour traiter une demande de permis (approuver/rejeter)
router.post('/:requestId/process', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide. Utilisez "approve" ou "reject".' });
    }
    // Vérifier la demande
    const request = await db.select().from(permitRequests).where(eq(permitRequests.id, parseInt(requestId))).limit(1);
    if (request.length === 0) {
      return res.status(404).json({ message: 'Demande non trouvée.' });
    }

    // Mettre à jour le statut de la demande
    await db.update(permitRequests)
      .set({ status: action === 'approve' ? 'approved' : 'rejected', updatedAt: new Date() } as any)
      .where(eq(permitRequests.id, parseInt(requestId)));

    res.json({
      message: action === 'approve' ? 'Demande approuvée avec succès' : 'Demande rejetée',
      action,
      processedAt: new Date()
    });
  } catch (error) {
    console.error('Erreur lors du traitement de la demande:', error);
    res.status(500).json({ message: 'Erreur lors du traitement de la demande' });
  }
});

// Route pour télécharger un document
router.get('/documents/:hunterId/:documentType', isAuthenticated, async (req, res) => {
  try {
    const { hunterId, documentType } = req.params;

    // Dans le schéma actuel, les colonnes de documents ne sont pas définies côté `hunters`.
    // On renvoie une réponse informative.
    const hunter = await db.select({ id: hunters.id, firstName: hunters.firstName, lastName: hunters.lastName })
      .from(hunters)
      .where(eq(hunters.id, parseInt(hunterId)))
      .limit(1);

    if (hunter.length === 0) {
      return res.status(404).json({ message: 'Chasseur non trouvé.' });
    }

    return res.status(501).json({
      message: 'Téléchargement de documents non pris en charge dans ce schéma.',
      hunterId,
      documentType,
      hunterName: `${hunter[0].firstName} ${hunter[0].lastName}`,
    });

  } catch (error) {
    console.error('Erreur lors du téléchargement du document:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
  }
});

// Créer une nouvelle demande de permis
router.post<RequestParams, any, any, any>(
  '/:hunterId/create-request',
  isAuthenticated,
  async (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    try {
      const hunterIdParam = req.params.hunterId;
      if (!hunterIdParam || !/^\d+$/.test(hunterIdParam)) {
        return res.status(400).json({ success: false, message: 'ID de chasseur invalide' });
      }
      const hunterIdNum = parseInt(hunterIdParam, 10);
      const userId = Number((req.user as any)?.id); // ID de l'utilisateur connecté

      // Vérifier si le chasseur existe
      const hunter = await db.select().from(hunters).where(eq(hunters.id, hunterIdNum)).limit(1);

      if (hunter.length === 0) {
        return res.status(404).json({ success: false, message: 'Chasseur non trouvé' });
      }

      // Vérifier que l'utilisateur est autorisé à créer une demande pour ce chasseur
      // Dans le schéma actuel, pas de champ userId sur hunter. On autorise admin/agent/sub-agent.
      const currentUser = (req as any).user as any;
      const role = currentUser?.role as string;
      if (!['admin', 'agent', 'sub-agent'].includes(role)) {
        return res.status(403).json({ success: false, message: 'Non autorisé' });
      }

      // Vérifier si le dossier est complet
      const validation = await validateHunterForPermitRequest(hunterIdNum);
      if (!validation.canCreatePermit) {
        return res.status(400).json({
          success: false,
          message: 'Le dossier du chasseur est incomplet',
          data: {
            missingItems: validation.missingItems,
            completionPercentage: validation.completionPercentage
          }
        });
      }

      // Vérifier s'il existe déjà une demande en attente pour ce chasseur
      const existingRequest = await db
        .select({ id: permitRequests.id })
        .from(permitRequests)
        .where(and(eq(permitRequests.hunterId, hunterIdNum), eq(permitRequests.status, 'pending')))
        .limit(1);

      if (existingRequest.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Une demande est déjà en attente pour ce chasseur',
          data: { requestId: existingRequest[0].id }
        });
      }

      // Vérifier si le chasseur a déjà un permis actif
      const activePermit = await db
        .select({ id: permits.id })
        .from(permits)
        .where(and(eq(permits.hunterId, hunterIdNum), eq(permits.status, 'active')))
        .limit(1);

      if (activePermit.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ce chasseur a déjà un permis actif',
          data: { permitId: activePermit[0].id }
        });
      }

      // Préparer les données de la demande de permis
      const h = hunter[0];

      // Récupérer le domaine de chasse pour l'associer à la demande
      const domaineRes = await db.execute(sql`SELECT id FROM domaines WHERE nom_domaine = 'CHASSE' LIMIT 1`);
      const domaineRows = Array.isArray(domaineRes) ? domaineRes : (domaineRes as any)?.rows ?? [];
      const domaineId = domaineRows.length > 0 ? (domaineRows[0] as any).id : null;

      const year = new Date().getFullYear();
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let randomStr = '';
      for (let i = 0; i < 7; i++) randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
      const refNumber = `REF${year}-${randomStr}`;

      const requestData: any = {
        userId,
        hunterId: hunterIdNum,
        requestedType: 'chasse',
        requestedCategory: h.category || 'resident',
        region: h.region || null,
        domaineId: domaineId,
        status: 'pending',
        referenceNumber: refNumber,
      };

      try {
        const inserted = await db.insert(permitRequests)
          .values(requestData as any)
          .returning();

        res.status(201).json({
          success: true,
          message: 'Demande de permis créée avec succès',
          data: { request: inserted[0] }
        });
      } catch (error) {
        console.error('Erreur lors de la création de la demande:', error);
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la création de la demande',
          error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error('Erreur lors de la création de la demande de permis:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la demande de permis',
        error: errorMessage
      });
    }
  });

// Approuver une demande
router.post('/:requestId/approve', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    await db.update(permitRequests).set({ status: 'approved', updatedAt: new Date() } as any).where(eq(permitRequests.id, parseInt(requestId)));
    res.json({ success: true, message: 'Demande approuvée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Rejeter une demande
router.post('/:requestId/reject', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    await db.update(permitRequests).set({ status: 'rejected', updatedAt: new Date() } as any).where(eq(permitRequests.id, parseInt(requestId)));
    res.json({ success: true, message: 'Demande rejetée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Réexaminer une demande
router.post('/:requestId/reexamine', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    await db.update(permitRequests).set({ status: 'pending', updatedAt: new Date() } as any).where(eq(permitRequests.id, parseInt(requestId)));
    res.json({ success: true, message: 'Demande réexaminée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Délivrer le permis
router.post('/:requestId/deliver', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    await db.update(permitRequests).set({ status: 'delivered', updatedAt: new Date() } as any).where(eq(permitRequests.id, parseInt(requestId)));
    res.json({ success: true, message: 'Permis délivré' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Supprimer une demande
router.delete('/:requestId', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    await db.delete(permitRequests).where(eq(permitRequests.id, parseInt(requestId)));
    res.json({ success: true, message: 'Demande supprimée' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Approbation en masse
router.post('/bulk-approve', isAuthenticated, async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      await db.update(permitRequests).set({ status: 'approved', updatedAt: new Date() } as any).where(inArray(permitRequests.id, ids));
    }
    res.json({ success: true, message: 'Demandes approuvées' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Rejet en masse
router.post('/bulk-reject', isAuthenticated, async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      await db.update(permitRequests).set({ status: 'rejected', updatedAt: new Date() } as any).where(inArray(permitRequests.id, ids));
    }
    res.json({ success: true, message: 'Demandes rejetées' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur' });
  }
});

// Route appelée par le chasseur pour soumettre ou mettre à jour une demande (Brouillon/En attente)
router.post('/request', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = Number((req.user as any)?.id);
    if (!currentUserId) return res.status(401).json({ message: 'Non authentifié' });

    // Trouver le hunterId de l'utilisateur
    const userRecords = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
    const user = userRecords[0] as any;
    const hunterId = user?.hunterId || user?.hunter_id;

    if (!hunterId) {
      return res.status(400).json({ success: false, message: "Profil chasseur introuvable pour cet utilisateur." });
    }

    // Condition obligatoire : campagne ouverte + dossier validé pour la campagne en cours
    const { getHunterDossierVerification } = await import('../services/hunterDossierVerification.js');
    const dossierVerification = await getHunterDossierVerification(Number(hunterId));
    if (!dossierVerification.campaignOpen) {
      return res.status(403).json({
        success: false,
        code: 'CAMPAIGN_CLOSED',
        verificationStatus: dossierVerification.status,
        campaignOpen: false,
        message: "La campagne de chasse est actuellement fermée. Les demandes de permis reprendront à l'ouverture de la prochaine campagne.",
      });
    }
    if (dossierVerification.status !== 'validated') {
      const msg =
        dossierVerification.status === 'rejected'
          ? 'Votre dossier contient des pièces invalidées. Veuillez corriger et renvoyer les documents concernés avant de soumettre une demande de permis.'
          : dossierVerification.expiredForNewCampaign
          ? "Une nouvelle campagne de chasse a débuté. Votre dossier doit être validé à nouveau par l'administration avant toute demande de permis."
          : "Votre dossier est en attente de vérification et de validation par l'administration avant toute demande de permis.";
      return res.status(403).json({
        success: false,
        code: 'DOSSIER_NOT_VALIDATED',
        verificationStatus: dossierVerification.status,
        invalidatedDocs: dossierVerification.invalidatedDocs,
        reason: dossierVerification.reason,
        message: msg,
      });
    }

    const { id, status, permitType, requestedType, requestedCategory } = req.body;
    const targetPermitKey = String(requestedType || permitType || '').trim();
    const targetPermitLower = targetPermitKey.toLowerCase();

    // Règle d'unicité par catégorie (alignée sur POST /api/permits et PermitForm.tsx) :
    // Un chasseur peut cumuler différentes catégories (ex. classique + gibier d'eau + autre),
    // mais ne peut pas demander deux fois la même catégorie / grande famille active pour la même campagne.
    if (targetPermitLower && status !== 'draft') {
      const isGibierEau = targetPermitLower.includes('gibier-eau');
      if (isGibierEau) {
        const conflictRes: any = await db.execute(sql`
          SELECT id, permit_number AS "permitNumber", category_id AS "categoryId", metadata, expiry_date AS "expiryDate"
          FROM permits
          WHERE hunter_id = ${Number(hunterId)}
            AND status = 'active'
            AND category_id ILIKE '%gibier-eau%'
          ORDER BY created_at DESC
          LIMIT 1
        ` as any);
        const conflictRows: any[] = Array.isArray(conflictRes) ? conflictRes : (conflictRes?.rows || []);
        if (conflictRows.length > 0) {
          const c = conflictRows[0];
          const isExpired = !!c?.expiryDate && new Date(c.expiryDate) < new Date();
          let renewalsCount = 0;
          try {
            let meta = c?.metadata;
            if (typeof meta === 'string') meta = JSON.parse(meta);
            if (meta && Array.isArray(meta.renewals)) renewalsCount = meta.renewals.length;
            else if (meta && typeof meta.renewalCount === 'number') renewalsCount = meta.renewalCount;
          } catch {}
          const isEpuise = renewalsCount >= 2 && isExpired;
          if (!isEpuise) {
            return res.status(409).json({
              success: false,
              message: "Vous détenez déjà un permis de Gibier d'Eau actif pour cette campagne.",
            });
          }
        }
      } else {
        const activePermitsRes: any = await db.execute(sql`
          SELECT id, permit_number AS "permitNumber", category_id AS "categoryId", type
          FROM permits
          WHERE hunter_id = ${Number(hunterId)}
            AND status = 'active'
            AND expiry_date >= CURRENT_DATE
        ` as any);
        const activeRows: any[] = Array.isArray(activePermitsRes) ? activePermitsRes : (activePermitsRes?.rows || []);

        const isClassicFamily = (k: string) =>
          k.includes('resident') || k.includes('coutumier') || k.includes('touriste') || k.includes('touristique');
        const familyOf = (k: string) => {
          if (k.includes('resident')) return 'resident';
          if (k.includes('coutumier')) return 'coutumier';
          if (k.includes('touriste') || k.includes('touristique')) return 'touriste';
          return k;
        };

        const targetFamily = familyOf(targetPermitLower);
        const conflicting = activeRows.find((p: any) => {
          const existingKey = String(p.categoryId || p.type || '').toLowerCase().trim();
          if (!existingKey || existingKey.includes('gibier-eau')) return false;
          if (existingKey === targetPermitLower) return true;
          if (isClassicFamily(targetPermitLower) && isClassicFamily(existingKey)) {
            return familyOf(existingKey) === targetFamily;
          }
          return false;
        });

        if (conflicting) {
          return res.status(409).json({
            success: false,
            message: `Vous possédez déjà un permis actif dans cette catégorie (${conflicting.permitNumber}) pour la campagne en cours. Vous pouvez toutefois demander une autre catégorie de permis.`,
          });
        }
      }

      // Vérifier aussi s'il n'existe pas déjà une demande en attente pour cette même catégorie
      const existingReqRes: any = await db.execute(sql`
        SELECT id FROM permit_requests
        WHERE hunter_id = ${Number(hunterId)}
          AND status = 'pending'
          AND LOWER(requested_type) = ${targetPermitLower}
          ${id ? sql`AND id <> ${Number(id)}` : sql``}
        LIMIT 1
      ` as any);
      const existingReqRows: any[] = Array.isArray(existingReqRes) ? existingReqRes : (existingReqRes?.rows || []);
      if (existingReqRows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Une demande est déjà en attente de traitement pour cette catégorie de permis.',
        });
      }
    }

    // Récupérer le domaine 'chasse'
    const domaineRes = await db.execute(sql`SELECT id FROM domaines WHERE nom_domaine = 'CHASSE' LIMIT 1`);
    const domaineRows = Array.isArray(domaineRes) ? domaineRes : (domaineRes as any)?.rows ?? [];
    const domaineId = domaineRows.length > 0 ? (domaineRows[0] as any).id : null;

    if (id) {
      // Mise à jour
      await db.update(permitRequests)
        .set({
          status: status,
          requestedType: requestedType || permitType,
          requestedCategory: requestedCategory,
          updatedAt: new Date()
        } as any)
        .where(eq(permitRequests.id, parseInt(id)));

      return res.json({ success: true, message: 'Demande mise à jour' });
    } else {
      // Insertion
      const hunterRecords = await db.select().from(hunters).where(eq(hunters.id, hunterId)).limit(1);
      const hunter = hunterRecords[0];

      const year = new Date().getFullYear();
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let randomStr = '';
      for (let i = 0; i < 7; i++) randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
      const refNumber = `REF${year}-${randomStr}`;

      const requestData: any = {
        userId: currentUserId,
        hunterId: hunterId,
        requestedType: requestedType || permitType || 'chasse',
        requestedCategory: requestedCategory || hunter?.category || 'resident',
        region: hunter?.region || null,
        domaineId: domaineId,
        status: status || 'pending',
        referenceNumber: refNumber,
      };

      const inserted = await db.insert(permitRequests).values(requestData).returning();
      return res.status(201).json({ success: true, message: 'Demande créée', data: { request: inserted[0] } });
    }
  } catch (error) {
    console.error('Erreur /request:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

export default router;
