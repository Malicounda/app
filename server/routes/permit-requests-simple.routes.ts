import { Router } from 'express';
import { db } from '../db.js';
import { eq, sql } from 'drizzle-orm';

const router = Router();

// Middleware d'authentification simple
const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.session?.user) {
    next();
  } else {
    res.status(401).json({ message: 'Non authentifié' });
  }
};

// Récupérer toutes les demandes de permis avec les chasseurs
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Récupérer les chasseurs avec présence de documents via la table hunter_documents
    const huntersWithDocumentsResult = await db.execute(sql`
      SELECT 
        h.id as hunter_id,
        CONCAT(h.first_name, ' ', h.last_name) as hunter_name,
        h.category as hunter_category,
        h.region,
        h.phone,
        h.created_at as request_date,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'idCardDocument'
        ) as has_id_card_document,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'weaponPermit'
        ) as has_weapon_permit,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'hunterPhoto'
        ) as has_hunter_photo,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'treasuryStamp'
        ) as has_treasury_stamp,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'weaponReceipt'
        ) as has_weapon_receipt,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'insurance'
        ) as has_insurance,
        EXISTS(
          SELECT 1 FROM hunter_documents d 
          WHERE d.hunter_id = h.id AND d.document_type = 'moralCertificate'
        ) as has_moral_certificate,
        (
          CASE 
            WHEN (
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'idCardDocument') AND
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'weaponPermit') AND
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'hunterPhoto') AND
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'treasuryStamp') AND
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'weaponReceipt') AND
              EXISTS(SELECT 1 FROM hunter_documents d WHERE d.hunter_id = h.id AND d.document_type = 'insurance')
            ) THEN true ELSE false
          END
        ) as documents_complete
      FROM hunters h 
      WHERE h.is_active = true
      ORDER BY h.created_at DESC
    `);
    const huntersWithDocuments = Array.isArray(huntersWithDocumentsResult)
      ? huntersWithDocumentsResult
      : (huntersWithDocumentsResult as any)?.rows ?? [];

    // Récupérer les demandes existantes
    const existingRequestsResult = await db.execute(sql`
      SELECT hunter_id, status, created_at, updated_at
      FROM permit_requests
    `);
    const existingRequests = Array.isArray(existingRequestsResult)
      ? existingRequestsResult
      : (existingRequestsResult as any)?.rows ?? [];

    // Créer la réponse avec le format attendu
    const requests = (huntersWithDocuments as any[]).map((hunter: any) => {
      const existingRequest = (existingRequests as any[]).find((r: any) => r.hunter_id === hunter.hunter_id);
      
      return {
        id: hunter.hunter_id,
        hunterId: hunter.hunter_id,
        hunterName: hunter.hunter_name,
        hunterCategory: hunter.hunter_category || 'resident',
        requestDate: hunter.request_date,
        requestStatus: existingRequest?.status || 'pending',
        permitType: 'chasse',
        region: hunter.region || 'Non spécifiée',
        phone: hunter.phone || '',
        documents: {
          idCardDocument: Boolean(hunter.has_id_card_document),
          weaponPermit: Boolean(hunter.has_weapon_permit),
          hunterPhoto: Boolean(hunter.has_hunter_photo),
          treasuryStamp: Boolean(hunter.has_treasury_stamp),
          weaponReceipt: Boolean(hunter.has_weapon_receipt),
          insurance: Boolean(hunter.has_insurance),
          moralCertificate: Boolean(hunter.has_moral_certificate),
        },
        documentsComplete: hunter.documents_complete,
        processedBy: null,
        processedAt: existingRequest?.updated_at,
        agentName: null,
      };
    });
    
    res.json(requests);
  } catch (error) {
    console.error('Erreur lors de la récupération des demandes de permis:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes de permis' });
  }
});

// Route pour traiter une demande de permis
router.post('/:requestId/process', isAuthenticated, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide. Utilisez "approve" ou "reject".' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    
    // Vérifier si une demande existe déjà
    const existingRequestResult = await db.execute(sql`
      SELECT id FROM permit_requests WHERE hunter_id = ${requestId}
    `);
    const existingReqRows = Array.isArray(existingRequestResult)
      ? existingRequestResult
      : (existingRequestResult as any)?.rows ?? [];

    if (existingReqRows.length > 0) {
      // Mettre à jour la demande existante
      await db.execute(sql`
        UPDATE permit_requests 
        SET status = ${status}, updated_at = NOW()
        WHERE hunter_id = ${requestId}
      `);
    } else {
      // Créer une nouvelle demande
      await db.execute(sql`
        INSERT INTO permit_requests (user_id, hunter_id, requested_type, status, created_at)
        VALUES (${req.session.user.id}, ${requestId}, 'chasse', ${status}, NOW())
      `);
    }

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

    // Récupérer les informations du chasseur
    const hunterResult = await db.execute(sql`
      SELECT * FROM hunters WHERE id = ${hunterId}
    `);
    const hunterRows = Array.isArray(hunterResult)
      ? hunterResult
      : (hunterResult as any)?.rows ?? [];

    if (hunterRows.length === 0) {
      return res.status(404).json({ message: 'Chasseur non trouvé.' });
    }
    const hunterData = hunterRows[0] as any;
    const documentPath = hunterData[documentType];

    if (!documentPath) {
      return res.status(404).json({ message: 'Document non trouvé.' });
    }

    res.json({
      hunterId,
      documentType,
      documentPath,
      hunterName: `${hunterData.first_name} ${hunterData.last_name}`,
      message: 'Document trouvé. Dans une implémentation complète, le fichier serait téléchargé.'
    });

  } catch (error) {
    console.error('Erreur lors du téléchargement du document:', error);
    res.status(500).json({ message: 'Erreur lors du téléchargement du document' });
  }
});

export default router;
