import { Router } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// Récupérer toutes les activités de chasse selon les permissions
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const role = String(currentUser?.role || '').toLowerCase();
    const isAdmin = role.includes('admin');
    
    // Détection correcte des agents régionaux et secteur
    const isAgentGeneric = role === 'agent';
    const isSubAgent = role === 'sub-agent';
    const isRegional = role.includes('regional') || (isAgentGeneric && !currentUser?.departement);
    const isSector = role.includes('sector') || role.includes('secteur') || isSubAgent || (isAgentGeneric && !!currentUser?.departement);
    
    const scope = String(req.query.scope || '').toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 500, 5000);

    console.log(`[GET /hunting-activities] User: ${currentUser?.id}, role: ${role}, scope: ${scope}, region: ${currentUser?.region}, departement: ${currentUser?.departement}, isRegional: ${isRegional}, isSector: ${isSector}`);

    let whereClause = sql`TRUE`;

    if (isAdmin && scope === 'all') {
      // Admin avec scope=all: toutes les activités
      console.log('[GET /hunting-activities] Mode ADMIN - Toutes les activités');
      whereClause = sql`TRUE`;
    } else if (isRegional || isSector) {
      // Agents: filtrer par région/département via coordonnées GPS
      const userRows: any[] = await db.execute(sql`
        SELECT region, departement FROM users WHERE id = ${currentUser.id} LIMIT 1
      ` as any);
      const userInfo = userRows?.[0];
      console.log('[GET /hunting-activities] User info:', { region: userInfo?.region, departement: userInfo?.departement });
      
      if (userInfo?.region) {
        const regionName = String(userInfo.region).trim();
        
        if (isSector && userInfo?.departement) {
          const deptName = String(userInfo.departement).trim();
          console.log(`[GET /hunting-activities] Filtrage SECTEUR: region=${regionName}, departement=${deptName}`);
          // Filtrer par région ET département
          whereClause = sql`
            ha.lat IS NOT NULL AND ha.lon IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM regions r 
              WHERE LOWER(r.nom) = LOWER(${regionName})
                AND ST_Intersects(r.geom, ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(r.geom)))
            )
            AND EXISTS (
              SELECT 1 FROM departements d 
              WHERE LOWER(d.nom) = LOWER(${deptName})
                AND ST_Intersects(d.geom, ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(d.geom)))
            )
          ` as any;
        } else {
          console.log(`[GET /hunting-activities] Filtrage REGIONAL: region=${regionName}`);
          // Filtrer par région uniquement
          whereClause = sql`
            ha.lat IS NOT NULL AND ha.lon IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM regions r 
              WHERE LOWER(r.nom) = LOWER(${regionName})
                AND ST_Intersects(r.geom, ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(r.geom)))
            )
          ` as any;
        }
      }
    } else {
      // Chasseurs/guides: seulement leurs propres activités
      console.log(`[GET /hunting-activities] Mode CHASSEUR/GUIDE: hunterId=${currentUser?.hunterId}`);
      if (currentUser?.hunterId) {
        whereClause = sql`ha.hunter_id = ${currentUser.hunterId}` as any;
      } else {
        return res.json([]);
      }
    }

    const rows = await db.execute(sql`
      SELECT 
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
        ha.hunting_date,
        ha.created_at,
        ha.activity_number,
        ha.source_type,
        (
          SELECT r.nom 
          FROM regions r 
          WHERE ha.lat IS NOT NULL AND ha.lon IS NOT NULL 
            AND ST_Intersects(r.geom, ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(r.geom)))
          LIMIT 1
        ) as region,
        (
          SELECT d.nom 
          FROM departements d 
          WHERE ha.lat IS NOT NULL AND ha.lon IS NOT NULL 
            AND ST_Intersects(d.geom, ST_Transform(ST_SetSRID(ST_Point(ha.lon, ha.lat), 4326), ST_SRID(d.geom)))
          LIMIT 1
        ) as departement
      FROM hunting_activities ha
      WHERE ${whereClause}
      ORDER BY ha.created_at DESC
      LIMIT ${limit}
    ` as any);

    const activities = (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: row.id,
      hunterId: row.hunter_id,
      permitId: row.permit_id,
      permitNumber: row.permit_number,
      speciesId: row.species_id,
      speciesName: row.species_name,
      scientificName: row.scientific_name,
      sex: row.sex,
      quantity: row.quantity || 1,
      location: row.location,
      lat: row.lat ? parseFloat(row.lat) : null,
      lon: row.lon ? parseFloat(row.lon) : null,
      huntingDate: row.hunting_date,
      createdAt: row.created_at,
      activityNumber: row.activity_number,
      sourceType: row.source_type,
      region: row.region,
      departement: row.departement,
    }));

    console.log(`[GET /hunting-activities] Retour de ${activities.length} activités`);
    res.json(activities);
  } catch (error: any) {
    console.error('[GET /hunting-activities] Erreur:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
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
    const roleLc = role.toLowerCase();
    const isAgent = ['admin', 'agent', 'sub-agent'].includes(roleLc);
    const isSameHunter = Number(currentUser?.hunterId) === hunterId;
    const isGuideRole = roleLc === 'guide' || roleLc === 'hunting-guide' || roleLc.includes('guide');

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

    const validatedActivities = allRows.map((row: any) => {
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

    // Récupérer également les déclarations en attente (pending ou NULL) depuis declaration_especes
    const pendingRows = await db.execute(sql`
      SELECT 
        de.id,
        de.hunter_id,
        de.permit_id,
        de.permit_number,
        de.espece_id AS species_id,
        de.nom_espece AS species_name,
        de.nom_scientifique AS scientific_name,
        de.sexe AS sex,
        COALESCE(de.quantity, 1) AS quantity,
        de.location,
        de.lat,
        de.lon,
        de.created_at AS hunting_date,
        de.photo_data,
        de.photo_mime,
        de.photo_name,
        COALESCE(de.status, 'pending') AS status,
        CASE WHEN de.guide_id IS NOT NULL THEN 'guide_declaration' ELSE 'direct_declaration' END AS source_type,
        de.id AS source_id,
        (
          SELECT r.nom 
          FROM regions r 
          WHERE de.lat IS NOT NULL AND de.lon IS NOT NULL 
            AND ST_Intersects(
              r.geom,
              ST_Transform(ST_SetSRID(ST_Point(de.lon, de.lat), 4326), ST_SRID(r.geom))
            )
          LIMIT 1
        ) as region_name,
        (
          SELECT d.nom 
          FROM departements d 
          WHERE de.lat IS NOT NULL AND de.lon IS NOT NULL 
            AND ST_Intersects(
              d.geom,
              ST_Transform(ST_SetSRID(ST_Point(de.lon, de.lat), 4326), ST_SRID(d.geom))
            )
          LIMIT 1
        ) as departement_name,
        (
          SELECT CONCAT(u.first_name, ' ', u.last_name)
          FROM hunting_guides hg
          JOIN users u ON u.id = hg.user_id
          WHERE hg.id = de.guide_id
        ) AS guide_name
      FROM declaration_especes de
      WHERE de.hunter_id = ${hunterId}
        AND (de.status IS NULL OR de.status = 'pending')
      ORDER BY de.created_at DESC
    `);

    const pendingArray = Array.isArray(pendingRows) ? pendingRows : [];
    console.log(`📥 Déclarations en attente trouvées: ${pendingArray.length}`);

    const pendingActivities = pendingArray.map((row: any) => ({
      id: row.id,
      source_type: row.source_type, // 'guide_declaration' | 'direct_declaration'
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
      created_at: row.hunting_date,
      activity_number: null,
      status: row.status || 'pending',
      // Indicateurs
      is_validated_activity: false,
      is_guide_declaration: String(row.source_type) === 'guide_declaration',
      guide_name: row.guide_name || null,
    }));

    // Fusionner validées + en attente
    const allActivities = [...validatedActivities, ...pendingActivities];

    // Trier par date (plus récent en premier)
    allActivities.sort((a, b) => new Date(b.created_at || b.hunting_date).getTime() - new Date(a.created_at || a.hunting_date).getTime());

    console.log(`✅ Retour de ${allActivities.length} activités (validated + pending)`);
    
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
