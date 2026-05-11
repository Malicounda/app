import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db.js';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { hunters, permits, permitRequests, users, type InsertPermitRequest } from '../../shared/dist/schema.js';


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

// Middleware d'authentification
const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.session?.user) {
    // Ajouter user à la requête pour un accès facile (typé via augmentation Express)
    req.user = req.session.user as any;
    next();
  } else {
    res.status(401).json({ success: false, message: 'Non authentifié' });
  }
};

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
        createdAt: permitRequests.createdAt,
        updatedAt: permitRequests.updatedAt,
        // Hunter info
        hunterFirstName: hunters.firstName,
        hunterLastName: hunters.lastName,
        hunterPhone: hunters.phone,
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
      .set({ status: action === 'approve' ? 'approved' : 'rejected', updatedAt: new Date() })
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
    const userId = Number(req.session.user.id); // ID de l'utilisateur connecté

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
    const requestData: Omit<InsertPermitRequest, 'status' | 'notes'> & { status?: 'pending' } = {
      userId,
      hunterId: hunterIdNum,
      requestedType: 'chasse',
      requestedCategory: h.category || 'resident',
      region: h.region || null as any,
      // status géré par défaut en DB ('pending')
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

export default router;
