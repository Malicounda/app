import { Router } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// Ping route to verify router is mounted
router.get('/', (_req, res) => {
  console.log('[hunting-activities] Ping received');
  res.json({ ok: true, message: 'hunting-activities router mounted' });
});

// Récupérer toutes les activités de chasse d'un chasseur (déclarations + activités validées)
router.get('/hunter/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const hunterId = Number(req.params.hunterId);
    
    if (Number.isNaN(hunterId)) {
      return res.status(400).json({ message: 'ID de chasseur invalide' });
    }

    // Vérifier les permissions
    const currentUser = req.user as any;
    const role = String(currentUser?.role || '');
    const isAgent = ['admin', 'agent', 'sub-agent'].includes(role);
    const isSameHunter = Number(currentUser?.hunterId) === hunterId;
    const isGuideRole = role === 'guide';

    if (!isAgent && !isSameHunter) {
      if (isGuideRole) {
        // Vérifier l'association active guide ↔ chasseur
        try {
          const rows: any[] = await db.execute(sql`
            SELECT 1
            FROM guide_hunter_associations gha
            JOIN hunting_guides hg ON gha.guide_id = hg.id
            WHERE gha.is_active = true
              AND gha.hunter_id = ${hunterId}
              AND hg.user_id = ${currentUser?.id}
            LIMIT 1
          ` as any);
          const allowed = Array.isArray(rows) && rows.length > 0;
          if (!allowed) {
            console.log(`❌ Permission guide refusée: user_id=${currentUser?.id} non associé à hunterId=${hunterId}`);
            return res.status(403).json({ message: 'Non autorisé' });
          }
        } catch (e) {
          console.log('❌ Vérification association guide échouée:', e);
          return res.status(403).json({ message: 'Non autorisé' });
        }
      } else {
        console.log(`❌ Permission refusée: role=${role}, user.hunterId=${currentUser?.hunterId}, requested hunterId=${hunterId}`);
        return res.status(403).json({ message: 'Non autorisé' });
      }
    }

    console.log(`🔍 Récupération des activités pour chasseur ID: ${hunterId}`);
    console.log(`👤 Utilisateur connecté: ID=${currentUser?.id}, hunterId=${currentUser?.hunterId}, role=${currentUser?.role}`);

    // Récupérer UNIQUEMENT les activités validées depuis hunting_activities pour ce chasseur
    const validatedRows = await db.execute(sql`
      SELECT 
        ha.source_type as source_type,
        ha.source_id,
        ha.id,
        ha.hunter_id,
        ha.permit_id,
        ha.permit_number,
        ha.species_id,
        ha.species_name,
        ha.scientific_name,
        ha.sex,
        ha.quantity,
        ha.location,
        ha.lat,
        ha.lon,
        (
          SELECT r.nom 
          FROM regions r 
          WHERE ha.lat IS NOT NULL AND ha.lon IS NOT NULL 
            AND ST_Intersects(
              r.geom,
              ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(r.geom))
            )
          LIMIT 1
        ) as region_name,
        (
          SELECT d.nom 
          FROM departements d 
          WHERE ha.lat IS NOT NULL AND ha.lon IS NOT NULL 
            AND ST_Intersects(
              d.geom,
              ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(d.geom))
            )
          LIMIT 1
        ) as departement_name,
        ha.hunting_date,
        ha.photo_data,
        ha.photo_mime,
        ha.photo_name,
        ha.created_at,
        ha.activity_number,
        true as from_validated,
        'approved' as status
      FROM hunting_activities ha
      WHERE ha.hunter_id = ${hunterId}
      ORDER BY ha.created_at DESC
    `);

    const allRows = Array.isArray(validatedRows) ? validatedRows : [];
    console.log(`📊 Résultats trouvés (hunting_activities uniquement): ${allRows.length}`);

    const allActivities = allRows.map((row: any) => {
      const mapped = {
      id: row.id,
      source_type: row.source_type,
      source_id: row.source_id,
      hunter_id: row.hunter_id,
      permit_id: row.permit_id,
      permit_number: row.permit_number,
      species_id: row.species_id,
      species_name: row.species_name,
      scientific_name: row.scientific_name,
      sex: row.sex,
      quantity: row.quantity || 1,
      location: row.location,
      lat: row.lat ? parseFloat(row.lat) : null,
      lon: row.lon ? parseFloat(row.lon) : null,
      hunting_date: row.hunting_date,
      region_name: row.region_name,
      departement_name: row.departement_name,
      photo_data: row.photo_data ? Buffer.from(row.photo_data).toString('base64') : null,
      photo_mime: row.photo_mime,
      photo_name: row.photo_name,
      created_at: row.created_at,
      activity_number: row.activity_number,
      status: row.status,
      // Indicateurs
      is_validated_activity: true,
      is_guide_declaration: String(row.source_type) === 'guide_declaration'
      };
      console.log(`[hunting-activities] Mapping row id=${row.id}, source_type=${row.source_type}, from_validated=${row.from_validated}, is_validated_activity=${mapped.is_validated_activity}`);
      return mapped;
    });

    // Trier par date de création (plus récent en premier)
    allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    console.log(`✅ Retour de ${allActivities.length} activités (validated)`);
    
    res.json(allActivities);
  } catch (error: any) {
    console.error('❌ Erreur lors de la récupération des activités:', error);
    res.status(500).json({ 
      message: 'Échec de la récupération des activités',
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Récupérer une activité spécifique avec sa photo
router.get('/:id/photo', isAuthenticated, async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    
    if (Number.isNaN(activityId)) {
      return res.status(400).json({ message: 'ID d\'activité invalide' });
    }

    // Chercher d'abord dans hunting_activities
    const activityResult = await db.execute(sql`
      SELECT photo_data, photo_mime, photo_name 
      FROM hunting_activities 
      WHERE id = ${activityId}
    `);
    const activityPhoto = Array.isArray(activityResult) ? activityResult[0] : activityResult;

    if (activityPhoto?.photo_data) {
      const mime = String(activityPhoto.photo_mime || 'application/octet-stream');
      res.setHeader('Content-Type', mime);
      if (activityPhoto.photo_name) {
        res.setHeader('Content-Disposition', `inline; filename="${String(activityPhoto.photo_name)}"`);
      }
      return res.end(activityPhoto.photo_data);
    }

    // Sinon chercher dans declaration_especes
    const declarationResult = await db.execute(sql`
      SELECT photo_data, photo_mime, photo_name 
      FROM declaration_especes 
      WHERE id = ${activityId}
    `);
    const declarationPhoto = Array.isArray(declarationResult) ? declarationResult[0] : declarationResult;

    if (declarationPhoto?.photo_data) {
      const mime = String(declarationPhoto.photo_mime || 'application/octet-stream');
      res.setHeader('Content-Type', mime);
      if (declarationPhoto.photo_name) {
        res.setHeader('Content-Disposition', `inline; filename="${String(declarationPhoto.photo_name)}"`);
      }
      return res.end(declarationPhoto.photo_data);
    }

    return res.status(404).json({ message: 'Photo non trouvée' });
  } catch (error: any) {
    console.error('❌ Erreur lors de la récupération de la photo:', error);
    res.status(500).json({ message: 'Échec de la récupération de la photo' });
  }
});

export default router;
