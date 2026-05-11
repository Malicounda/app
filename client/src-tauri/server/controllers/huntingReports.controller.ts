import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { resolveAdministrativeAreas } from '../lib/resolveAdminAreas.js';

// Fonction pour vérifier si la quantité demandée ne dépasse pas les taxes restantes
async function verifyTaxAvailability(
  permitId: number,
  speciesId: string,
  speciesName: string,
  requestedQuantity: number,
  hunterId: number
): Promise<{ allowed: boolean; available: number; error?: string }> {
  try {
    // Récupérer toutes les taxes achetées pour ce permis avec animalType qui correspond à l'espèce
    const taxesRows: any[] = await db.execute(sql`
      SELECT animal_type, quantity FROM taxes WHERE permit_id = ${permitId}
    `);

    // Récupérer toutes les déclarations/activités déjà faites pour cette espèce sur ce permis (incluant guides et chasseur direct)
    const usedRows: any[] = await db.execute(sql`
      SELECT COALESCE(quantity, 1) as qty FROM declaration_especes
      WHERE permit_id = ${permitId} AND espece_id = ${speciesId}
        AND (status IN ('approved', 'pending') OR status IS NULL)
      UNION ALL
      SELECT COALESCE(quantity, 1) as qty FROM hunting_activities
      WHERE permit_id = ${permitId} AND species_id = ${speciesId}
    `);

    // Fonction de normalisation pour matcher animalType et nom d'espèce
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
    const namesMatch = (a: string, b: string) => {
      const na = normalize(a);
      const nb = normalize(b);
      return na === nb || na.includes(nb) || nb.includes(na);
    };

    // Calculer le total de taxes achetées pour cette espèce
    let totalBought = 0;
    for (const tax of taxesRows) {
      if (namesMatch(tax.animal_type, speciesName)) {
        totalBought += Number(tax.quantity || 0);
      }
    }

    // Calculer la quantité déjà utilisée
    let totalUsed = 0;
    for (const used of usedRows) {
      totalUsed += Number(used.qty || 0);
    }

    const available = Math.max(0, totalBought - totalUsed);

    console.log(`[Tax Check] For permit ${permitId}, species ${speciesName} (${speciesId}): bought=${totalBought}, used=${totalUsed}, available=${available}, requested=${requestedQuantity}`);

    if (requestedQuantity > available) {
      return {
        allowed: false,
        available,
        error: `Quantité demandée (${requestedQuantity}) dépasse les taxes restantes (${available}) pour cette espèce.`
      };
    }

    return { allowed: true, available };
  } catch (error) {
    console.error('Error verifying tax availability:', error);
    return {
      allowed: false,
      available: 0,
      error: 'Erreur lors de la vérification des taxes disponibles'
    };
  }
}

export const createHuntingReport = async (req: Request, res: Response) => {
  try {
    console.log('=== createHuntingReport appelée ===');
    console.log('req.body:', req.body);
    console.log('req.file:', req.file);

    // Try to resolve user id from auth or request body
    const authUser: any = (req as any).user || {};
    const userId = Number(authUser?.id);
    if (!userId || Number.isNaN(userId)) {
      console.log('❌ Utilisateur non authentifié — userId manquant');
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    const permitNumber = req.body.permitNumber;
    const speciesId = req.body.speciesId;
    const sex = req.body.sex;
    const coordinates = req.body.coordinates;
    // Quantity (anciennement 'observations')
    const rawQuantity = (req.body.quantity ?? req.body.notes ?? req.body.observations);
    const quantity = rawQuantity != null ? parseInt(String(rawQuantity), 10) : NaN;
    const category = req.body.category;
    const nom_espece = req.body.nom_espece;
    const nom_scientifique = req.body.nom_scientifique;
    // Location: valeur par défaut basée sur les coordonnées si non fournie
    const location = req.body.location || (coordinates ? `GPS: ${coordinates}` : null);
    
    // Nouveaux champs pour gérer les déclarations par guides
    const hunterId = req.body.hunterId ? Number(req.body.hunterId) : null;
    const guideId = req.body.guideId ? Number(req.body.guideId) : null;

    console.log('Données extraites:', { userId, permitNumber, speciesId, sex, coordinates, quantity, category, nom_espece, nom_scientifique, location, hunterId, guideId });

    if (!userId || !permitNumber || !speciesId || !sex || !coordinates) {
      console.log('❌ Champs requis manquants');
      return res.status(400).json({ error: 'Champs requis manquants: userId, permitNumber, speciesId, sex, coordinates' });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantité invalide ou manquante (nombre entier > 0 requis)' });
    }

    // Parse coordinates like "lat, lon"
    let lat: number | null = null;
    let lon: number | null = null;
    if (typeof coordinates === 'string') {
      const [a, b] = coordinates.split(',').map((s: string) => parseFloat(s.trim()));
      if (!isNaN(a) && !isNaN(b)) {
        lat = a;
        lon = b;
      }
    }
    if (lat == null || lon == null) {
      return res.status(400).json({ error: 'Coordonnées GPS invalides' });
    }

    // Déduire les zones administratives à partir des coordonnées
    const { arrondissement, commune, departement, region } = await resolveAdministrativeAreas(lat, lon);

    // Logging détaillé de la géolocalisation et vérification de distance à la commune la plus proche
    try {
      const point4326 = sql`ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326)` as any;
      const distRows: any[] = await db.execute(sql`
        SELECT 
          c.nom AS commune,
          ST_Distance(c.geom, ST_Transform(${point4326}, ST_SRID(c.geom))) AS distance_m
        FROM public.communes c
        WHERE c.geom IS NOT NULL
        ORDER BY ST_Distance(c.geom, ST_Transform(${point4326}, ST_SRID(c.geom))) ASC
        LIMIT 1
      ` as any);
      const nearest = distRows?.[0];
      const nearestCommune = nearest?.commune ?? null;
      const nearestDist = Number(nearest?.distance_m ?? NaN);
      console.log('[GPS] Resolved areas:', { arrondissement, commune, departement, region });
      console.log('[GPS] Nearest commune check:', { nearestCommune, nearestDist_m: nearestDist });
      if (Number.isFinite(nearestDist) && nearestDist > 15000) {
        console.warn(`[GPS] Warning: point appears far from nearest commune (${nearestDist.toFixed(0)} m). Coordinates may be inaccurate.`);
      }
    } catch (e) {
      console.warn('[GPS] Distance/nearest commune check failed:', e);
    }

    // Optional photo from Multer (upload.single('photo'))
    const file = (req as any).file as Express.Multer.File | undefined;
    let photo_data: Buffer | null = null;
    let photo_mime: string | null = null;
    let photo_name: string | null = null;
    let photo_checksum: string | null = null;

    if (file && file.buffer) {
      photo_data = file.buffer;
      photo_mime = file.mimetype || null;
      photo_name = file.originalname || null;
      try {
        photo_checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
      } catch (_) {
        photo_checksum = null;
      }
    }

    // Resolve hunter_id et guide_id selon le contexte (guide ou chasseur direct)
    let finalHunterId: number | null = null;
    let finalGuideId: number | null = null;
    
    if (hunterId) {
      // Si hunterId est fourni (cas d'un guide qui déclare pour un chasseur)
      finalHunterId = hunterId;
      
      // Récupérer le guide_id depuis guide_hunter_associations
      const associationRows: any[] = await db.execute(sql`
        SELECT guide_id 
        FROM guide_hunter_associations 
        WHERE hunter_id = ${hunterId} AND is_active = true 
        LIMIT 1
      ` as any);
      const association = Array.isArray(associationRows) ? associationRows[0] : (associationRows as any)[0];
      finalGuideId = association?.guide_id ?? null;
      
      console.log(`🎯 Déclaration par guide (guide_id: ${finalGuideId}) pour chasseur (${hunterId})`);
    } else {
      // Sinon, résoudre depuis l'utilisateur connecté (chasseur direct)
      const userRows: any[] = await db.execute(sql`SELECT id, hunter_id FROM users WHERE id = ${userId} LIMIT 1` as any);
      const user = Array.isArray(userRows) ? userRows[0] : (userRows as any)[0];
      finalHunterId = user?.hunter_id ?? null;
      finalGuideId = null; // Pas de guide pour une déclaration directe
      console.log(`🏹 Déclaration directe par chasseur (${finalHunterId})`);
    }

    // Resolve permit_id and enforce validity if declared by a guide (association réelle)
    const permitRows: any[] = await db.execute(
      sql`SELECT id, status, expiry_date FROM permits WHERE permit_number = ${permitNumber} LIMIT 1` as any
    );
    const permit = Array.isArray(permitRows) ? permitRows[0] : (permitRows as any)[0];
    const permitId = permit?.id ?? null;
    if (finalGuideId) {
      // Un guide ne peut pas utiliser un permis suspendu ou expiré
      const pStatus = String(permit?.status || '').toLowerCase();
      const pExpiryRaw = permit?.expiry_date ?? null;
      const pExpiry = pExpiryRaw ? new Date(pExpiryRaw) : null;
      const isExpired = pExpiry ? pExpiry < new Date() : true;
      // Vérifier l'épuisement via metadata
      let renewalCount = 0;
      try {
        const metaRows: any[] = await db.execute(sql`SELECT metadata FROM permits WHERE id = ${permitId} LIMIT 1` as any);
        const meta = Array.isArray(metaRows) ? metaRows[0]?.metadata : (metaRows as any)[0]?.metadata;
        let m = meta;
        if (typeof m === 'string') m = JSON.parse(m);
        if (m && Array.isArray(m.renewals)) renewalCount = m.renewals.length;
        else if (m && typeof m.renewalCount === 'number') renewalCount = m.renewalCount;
      } catch {}
      const isExhausted = renewalCount >= 2;
      if (!permitId || pStatus !== 'active' || isExpired || isExhausted) {
        return res.status(409).json({
          error: "Déclaration refusée: le permis est suspendu, expiré, épuisé (>=2 renouvellements) ou introuvable pour une déclaration par guide."
        });
      }
    }

    // Vérifier que la quantité ne dépasse pas les taxes disponibles (pour les espèces listées)
    if (speciesId !== 'custom' && permitId && finalHunterId) {
      const taxCheck = await verifyTaxAvailability(
        permitId,
        speciesId,
        nom_espece,
        quantity,
        finalHunterId
      );

      if (!taxCheck.allowed) {
        return res.status(409).json({
          error: taxCheck.error,
          available: taxCheck.available
        });
      }
    }

    // Insert into declaration_especes (with optional photo columns and guide_id)
    const insertQuery = sql`
      INSERT INTO declaration_especes (
        user_id, hunter_id, guide_id, permit_id, permit_number,
        category, espece_id, nom_espece, nom_scientifique,
        sexe, quantity, lat, lon, location,
        arrondissement, commune, departement, region,
        photo_data, photo_mime, photo_name, photo_checksum,
        status
      ) VALUES (
        ${userId}, ${finalHunterId}, ${finalGuideId}, ${permitId}, ${permitNumber},
        ${category ?? null}, ${speciesId}, ${nom_espece ?? null}, ${nom_scientifique ?? null},
        ${sex}, ${quantity}, ${lat}, ${lon}, ${location ?? null},
        ${arrondissement ?? null}, ${commune ?? null}, ${departement ?? null}, ${region ?? null},
        ${photo_data}, ${photo_mime}, ${photo_name}, ${photo_checksum},
        ${finalGuideId ? 'pending' : 'approved'}
      )
      RETURNING id, created_at
    `;

    const result: any[] = await db.execute(insertQuery as any);
    const row = Array.isArray(result) ? result[0] : (result as any)[0];

    return res.status(201).json({ ok: true, id: row?.id, created_at: row?.created_at });
  } catch (error: any) {
    console.error('Error creating hunting report:', error);
    return res.status(500).json({ error: 'Failed to create hunting report' });
  }
};

export const getHuntingReports = async (req: Request, res: Response) => {
  try {
    const authUser: any = (req as any).user || {};
    const role: string = String(authUser?.role || '').toLowerCase();
    const isAdmin = role.includes('admin');
    const isRegional = role.includes('regional');
    const isSector = role.includes('sector') || role.includes('secteur') || role.includes('sub-agent');
    // Certains comptes ont le role générique "agent" sans qualifier "regional"; on les traite comme agents
    const isAgentGeneric = !isRegional && !isSector && role.includes('agent');

    // Query params
    const scope = String((req.query.scope as string) || '').toLowerCase();
    const region = (req.query.region as string) || null;
    const departement = (req.query.departement as string) || null;
    const limitRaw = Number((req.query.limit as string) || 500);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 500;

    // Backward compatibility: user's own reports by default
    const requestedUserId = Number((req.query.userId as string) || authUser?.id);

    // Build WHERE conditions based on permissions
    let whereSql: any = null;
    if (isAdmin && scope === 'all') {
      // National: pas de filtre user
      whereSql = sql`TRUE`;
    } else if (isRegional || isSector || isAgentGeneric) {
      // Récupérer la zone de l'agent
      const agentRows: any[] = await db.execute(sql`
        SELECT region, departement FROM users WHERE id = ${authUser.id} LIMIT 1
      ` as any);
      const agent = agentRows?.[0];

      if (agent?.region) {
        const agentRegion = String(agent.region || '').toLowerCase().trim();
        const hasDept = !!agent?.departement;
        const agentDept = hasDept ? String(agent.departement || '').toLowerCase().trim() : null;

        // Filtrage SPATIAL prioritaire si lat/lon présents: on intersecte la géométrie région/département
        // Fallback texte sur les colonnes region/departement quand lat/lon sont nuls
        if ((isSector || hasDept)) {
          // Agent de secteur: contraindre à la région ET au département
          whereSql = sql`
            (
              (lat IS NOT NULL AND lon IS NOT NULL AND EXISTS (
                SELECT 1 FROM departements d
                WHERE
                  -- nom de département approximatif + intersection du point
                  LOWER(translate(d.nom,
                    'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                    'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                  )) LIKE '%' || LOWER(translate(${agentDept},
                    'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                    'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                  )) || '%'
                  AND ST_Intersects(
                    d.geom,
                    ST_Transform(ST_SetSRID(ST_Point(lon, lat), 4326), ST_SRID(d.geom))
                  )
              ))
              OR (
                (lat IS NULL OR lon IS NULL)
                AND LOWER(translate(COALESCE(region, ''),
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) LIKE '%' || LOWER(translate(${agentRegion},
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) || '%'
                AND LOWER(translate(COALESCE(departement, ''),
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) LIKE '%' || LOWER(translate(${agentDept},
                  'àáâãäåèéêëìíîïóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) || '%'
              )
            )
          ` as any;
          console.log(`[getHuntingReports] Using SPATIAL+TEXT filter for sector agent. region=${agentRegion}, departement=${agentDept}`);
        } else {
          // Agent régional: contraindre à la région
          whereSql = sql`
            (
              (lat IS NOT NULL AND lon IS NOT NULL AND EXISTS (
                SELECT 1 FROM regions r
                WHERE LOWER(translate(r.nom,
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) LIKE '%' || LOWER(translate(${agentRegion},
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) || '%'
                  AND ST_Intersects(
                    r.geom,
                    ST_Transform(ST_SetSRID(ST_Point(lon, lat), 4326), ST_SRID(r.geom))
                  )
              ))
              OR (
                (lat IS NULL OR lon IS NULL)
                AND LOWER(translate(COALESCE(region, ''),
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) LIKE '%' || LOWER(translate(${agentRegion},
                  'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
                  'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
                )) || '%'
              )
            )
          ` as any;
          console.log(`[getHuntingReports] Using SPATIAL+TEXT filter for regional agent. region=${agentRegion}`);
        }
      } else {
        console.warn(`[getHuntingReports] Agent ${authUser.id} has no region defined, returning no results.`);
        return res.json([]);
      }
    } else {
      // Par défaut: seulement les déclarations de l'utilisateur courant
      if (!requestedUserId) return res.status(400).json({ error: 'userId manquant' });
      whereSql = sql`user_id = ${requestedUserId}`;
    }

    const query = sql`
      SELECT 
        de.id,
        de.user_id,
        de.hunter_id,
        de.guide_id,
        de.permit_number,
        de.espece_id,
        de.nom_espece,
        de.nom_scientifique,
        de.sexe,
        de.location,
        de.quantity,
        de.lat,
        de.lon,
        de.created_at,
        (de.photo_data IS NOT NULL) AS photo_available,
        de.arrondissement,
        de.commune,
        de.departement,
        de.region,
        h.first_name AS hunter_first_name,
        h.last_name AS hunter_last_name
      FROM declaration_especes de
      LEFT JOIN hunters h ON h.id = de.hunter_id
      WHERE ${whereSql} AND COALESCE(de.status, 'pending') <> 'approved'
      ORDER BY de.created_at DESC, de.id DESC
      LIMIT ${limit}
    ` as any;

    console.log(`[getHuntingReports] Executing hunting reports query`);
    const rows: any[] = await db.execute(query);
    
    console.log(`[getHuntingReports] *** RESULTS: ${rows.length} rows found ***`);
    if (rows.length > 0) {
      console.log(`[getHuntingReports] First result:`, rows[0]);
    }

    const items = (rows || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      hunterId: r.hunter_id,
      guideId: r.guide_id,
      permitNumber: r.permit_number,
      speciesId: r.espece_id,
      speciesName: r.nom_espece,
      scientificName: r.nom_scientifique,
      sex: r.sexe,
      location: r.location,
      quantity: r.quantity,
      lat: r.lat,
      lon: r.lon,
      date: r.created_at,
      photoAvailable: !!r.photo_available,
      arrondissement: r.arrondissement || null,
      commune: r.commune || null,
      departement: r.departement || null,
      region: r.region || null,
      hunterName: [r.hunter_first_name, r.hunter_last_name].filter(Boolean).join(' ').trim() || null,
    }));

    return res.json(items);
  } catch (error) {
    console.error('Error fetching hunting reports:', error);
    return res.status(500).json({ error: 'Failed to fetch hunting reports' });
  }
};

export const getHuntingReportPhoto = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id manquant' });

    const rows: any[] = await db.execute(sql`
      SELECT photo_data, photo_mime, photo_name FROM declaration_especes WHERE id = ${id} LIMIT 1
    ` as any);
    const row = Array.isArray(rows) ? rows[0] : (rows as any)[0];
    if (!row || !row.photo_data) return res.status(404).json({ error: 'Photo non trouvée' });

    const mime = row.photo_mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    if (row.photo_name) res.setHeader('Content-Disposition', `inline; filename="${row.photo_name}"`);
    return res.end(row.photo_data);
  } catch (error) {
    console.error('Error fetching hunting report photo:', error);
    return res.status(500).json({ error: 'Failed to fetch photo' });
  }
};
