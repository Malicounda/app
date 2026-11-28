// @ts-nocheck - Désactivation temporaire des vérifications TypeScript pour les incompatibilités Drizzle ORM
import { and, count, desc, eq, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
    alerts,
    history,
    hunters,
    permitRequests,
    permits,
    taxes,
    userDomains,
    users
} from '../../shared/schema.js';
import { db } from '../db.js';
import { resolveAdministrativeAreas } from '../lib/resolveAdminAreas.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

const CANONICAL_REGION_LABELS: Record<string, string> = {
  national: 'DEFCCS',
  defccs: 'DEFCCS',
  dakar: 'DAKAR',
  thies: 'THIÈS',
  saintlouis: 'SAINT-LOUIS',
  louga: 'LOUGA',
  fatick: 'FATICK',
  kaolack: 'KAOLACK',
  kaffrine: 'KAFFRINE',
  matam: 'MATAM',
  tambacounda: 'TAMBACOUNDA',
  kedougou: 'KÉDOUGOU',
  kolda: 'KOLDA',
  sedhiou: 'SÉDHIOU',
  ziguinchor: 'ZIGUINCHOR',
  diourbel: 'DIOURBEL',
};

function normalizeRegionKey(raw: string | null | undefined): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_\s]+/g, '');
  if (s === 'defccs') return 'national';
  return s || 'nondefini';
}

function canonicalRegionName(raw: string | null | undefined): string {
  const key = normalizeRegionKey(raw);
  if (CANONICAL_REGION_LABELS[key]) return CANONICAL_REGION_LABELS[key];
  const cleaned = String(raw || '').trim();
  return cleaned ? cleaned.toUpperCase() : 'Non défini';
}

// GET /api/stats - Récupérer les statistiques générales
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Récupérer les statistiques de base
    const [
      huntersCount,
      permitsCount,
      activePermitsCount,
      pendingRequestsCount,
      guidesCount,
      agentsCount,
      usersTotalCount,
      taxesCount,
      alertsCount
    ] = await Promise.all([
      db.select({ count: count() }).from(hunters as any),
      db.select({ count: count() }).from(permits as any),
      db.select({ count: count() }).from(permits as any).where(eq(permits.status as any, 'active')),
      db.select({ count: count() }).from(permitRequests as any).where(eq(permitRequests.status as any, 'pending')),
      db.select({ count: count() }).from(users as any).where(eq(users.role as any, 'hunting-guide')),
      db.select({ count: count() }).from(users as any).where(or(eq(users.role as any, 'agent'), eq(users.role as any, 'sub-agent'))),
      db.select({ count: count() }).from(users as any),
      db.select({ count: count() }).from(taxes as any),
      db.select({ count: count() }).from(alerts as any),
    ]);

    // Construire l'objet de statistiques
    const stats = {
      hunters: huntersCount[0]?.count || 0,
      permits: permitsCount[0]?.count || 0,
      activePermits: activePermitsCount[0]?.count || 0,
      pendingRequests: pendingRequestsCount[0]?.count || 0,
      guides: guidesCount[0]?.count || 0,
      agents: agentsCount[0]?.count || 0,
      usersTotal: usersTotalCount[0]?.count || 0,
      taxCount: taxesCount[0]?.count || 0,
      alertsCount: alertsCount[0]?.count || 0,
    };

    return res.json(stats);
  } catch (error: any) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', debug: error?.message || String(error), stack: error?.stack });
  }
});

// GET /api/stats/national/permit-categories-breakdown
router.get('/national/permit-categories-breakdown', isAuthenticated, async (req, res) => {
  try {
    const region = typeof req.query.region === 'string' ? req.query.region.trim() : '';

    const rows: Array<{
      groupe: string | null;
      genre: string | null;
      sous_categorie: string | null;
      category_key: string;
      label_fr: string;
      display_order: number | null;
      hunters_count: number;
      permits_count: number;
      total_amount: number;
    }> = await db.execute(
      sql`SELECT
            pc.groupe,
            pc.genre,
            pc.sous_categorie,
            pc.key AS category_key,
            pc.label_fr,
            pc.display_order,
            COALESCE(COUNT(DISTINCT p.hunter_id), 0) AS hunters_count,
            COALESCE(COUNT(p.id), 0) AS permits_count,
            COALESCE(SUM((p.price)::numeric), 0) AS total_amount
          FROM permit_categories pc
          LEFT JOIN permits p ON p.category_id = pc.key
          LEFT JOIN users u ON u.id = p.created_by
          ${region && region.toLowerCase() !== 'toutes' && region.toLowerCase() !== 'all'
            ? sql`WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))`
            : sql``}
          GROUP BY pc.groupe, pc.genre, pc.sous_categorie, pc.key, pc.label_fr, pc.display_order
          ORDER BY pc.groupe, pc.genre, COALESCE(pc.display_order, 9999), pc.label_fr` as any
    ) as any;

    const data = (rows || []).map(r => ({
      groupe: r.groupe || 'autre',
      genre: r.genre || null,
      sousCategorie: r.sous_categorie,
      categoryKey: r.category_key,
      labelFr: r.label_fr,
      displayOrder: r.display_order == null ? undefined : Number(r.display_order),
      huntersCount: Number(r.hunters_count || 0),
      permitsCount: Number(r.permits_count || 0),
      totalAmount: Number(r.total_amount || 0),
    }));

    return res.json(data);
  } catch (error: any) {
    console.error('Erreur /api/stats/national/permit-categories-breakdown:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération de la répartition par catégories', debug: error?.message || String(error) });
  }
});

// GET /api/stats/national/hunters-by-category - Chasseurs par région et catégorie (national, lieu d'enregistrement)
router.get('/national/hunters-by-category', isAuthenticated, async (_req, res) => {
  try {
    const raw = await db.execute(sql`
      SELECT
        LOWER(TRIM(COALESCE(
          NULLIF(TRIM(u_c.region), ''),
          NULLIF(TRIM(u_hist.region), ''),
          NULLIF(TRIM(u_h.region), ''),
          NULLIF(TRIM(h.region), '')
        ))) AS region,
        h.category AS category,
        COUNT(*)::int AS count
      FROM hunters h
      LEFT JOIN users u_h ON u_h.hunter_id = h.id
      LEFT JOIN users u_c ON u_c.id = h.created_by_user_id
      LEFT JOIN LATERAL (
        SELECT u_hi.region
        FROM history hi
        INNER JOIN users u_hi ON u_hi.id = hi.user_id
        WHERE hi.entity_type = 'hunter'
          AND hi.operation = 'create_hunter'
          AND hi.entity_id = h.id
        ORDER BY hi.id ASC
        LIMIT 1
      ) u_hist ON true
      WHERE COALESCE(h.is_active, true) = true
      GROUP BY 1, h.category
    ` as any);
    const data = Array.isArray(raw) ? raw : ((raw as any)?.rows || []);

    return res.json(
      (data || []).map((h: any) => ({
        region: canonicalRegionName(h.region),
        category: h.category || 'non défini',
        count: Number(h.count || 0),
      }))
    );
  } catch (error) {
    console.error('Erreur /api/stats/national/hunters-by-category:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des chasseurs par catégorie (national)' });
  }
});

// GET /api/stats/national/permits-by-category-by-region - Permis par région et catégorie avec durée moyenne
router.get('/national/permits-by-category-by-region', isAuthenticated, async (_req, res) => {
  try {
    const rows = await db
      .select({
        region: sql<string>`LOWER(TRIM(COALESCE(NULLIF(TRIM(${users.region}), ''), ${hunters.region})))`,
        categoryId: permits.categoryId,
        permitType: permits.type,
        count: count(),
        avgDurationDays: sql<number>`COALESCE(AVG((DATE_PART('day', ${permits.expiryDate}::timestamp - ${permits.issueDate}::timestamp))), 0)`,
      })
      .from(permits)
      .leftJoin(users, eq(permits.createdBy, users.id))
      .leftJoin(hunters, eq(permits.hunterId, hunters.id))
      .groupBy(
        sql`LOWER(TRIM(COALESCE(NULLIF(TRIM(${users.region}), ''), ${hunters.region})))`,
        permits.categoryId,
        permits.type
      );

    const merged = new Map<string, { region: string; categoryId: string; permitType: string; count: number; totalDays: number }>();
    for (const r of rows || []) {
      const regKey = normalizeRegionKey(r.region);
      const regLabel = canonicalRegionName(r.region);
      const cat = r.categoryId || r.permitType || 'non défini';
      const pType = r.permitType || r.categoryId || '';
      const key = `${regKey}::${cat}::${pType}`;
      const cnt = Number(r.count || 0);
      const avg = Number(r.avgDurationDays || 0);
      const prev = merged.get(key) || { region: regLabel, categoryId: cat, permitType: pType, count: 0, totalDays: 0 };
      prev.count += cnt;
      prev.totalDays += avg * cnt;
      merged.set(key, prev);
    }

    return res.json(
      Array.from(merged.values()).map((r) => ({
        region: r.region,
        categoryId: r.categoryId,
        permitType: r.permitType,
        count: r.count,
        avgDurationDays: r.count > 0 ? r.totalDays / r.count : 0,
      }))
    );
  } catch (error) {
    console.error('Erreur /api/stats/national/permits-by-category-by-region:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des permis par région et catégorie (national)' });
  }
});

// GET /api/stats/national/species-by-region - Somme des quantités par espèce et par région (déclarations)
router.get('/national/species-by-region', isAuthenticated, async (req, res) => {
  try {
    const rows: Array<{
      region: string;
      departement: string | null;
      arrondissement: string | null;
      commune: string | null;
      species_id: string;
      nom_espece: string | null;
      nom_scientifique: string | null;
      quantity: number;
      lat: string | number | null;
      lon: string | number | null;
      permit_number: string | null;
      declared_by: string | null;
      category: string | null;
      hunter_reg_region: string | null;
      hunter_reg_dept: string | null;
      hunter_reg_arr: string | null;
      hunter_reg_com: string | null;
    }> = await db.execute(
      sql`SELECT
            COALESCE(LOWER(TRIM(x.region)), 'nondefini') AS region,
            NULLIF(TRIM(x.departement), '') AS departement,
            NULLIF(TRIM(x.arrondissement), '') AS arrondissement,
            NULLIF(TRIM(x.commune), '') AS commune,
            x.species_id,
            COALESCE(x.nom_espece, '') AS nom_espece,
            COALESCE(x.nom_scientifique, '') AS nom_scientifique,
            COALESCE(x.quantity, 0) AS quantity,
            x.lat,
            x.lon,
            COALESCE(x.permit_number, '') AS permit_number,
            COALESCE(x.declared_by, 'Chasseur') AS declared_by,
            COALESCE(
              NULLIF(TRIM(e.groupe), ''),
              NULLIF(TRIM(x.category), ''),
              NULLIF(TRIM(p.type), ''),
              NULLIF(TRIM(p.category_id), ''),
              ''
            ) AS category,
            COALESCE(
              NULLIF(TRIM(u_hc.region), ''),
              NULLIF(TRIM(u_hhist.region), ''),
              NULLIF(TRIM(u_hu.region), ''),
              NULLIF(TRIM(h_reg.region), '')
            ) AS hunter_reg_region,
            COALESCE(
              NULLIF(TRIM(u_hc.departement), ''),
              NULLIF(TRIM(u_hhist.departement), ''),
              NULLIF(TRIM(u_hu.departement), ''),
              NULLIF(TRIM(h_reg.departement), '')
            ) AS hunter_reg_dept,
            COALESCE(
              NULLIF(TRIM(u_hc.arrondissement), ''),
              NULLIF(TRIM(u_hhist.arrondissement), ''),
              NULLIF(TRIM(u_hu.arrondissement), '')
            ) AS hunter_reg_arr,
            COALESCE(
              NULLIF(TRIM(u_hc.commune), ''),
              NULLIF(TRIM(u_hhist.commune), ''),
              NULLIF(TRIM(u_hu.commune), '')
            ) AS hunter_reg_com
          FROM (
            SELECT
              COALESCE(
                NULLIF(TRIM(d.region), ''),
                NULLIF(TRIM(u.region), ''),
                NULLIF(TRIM(h_d.region), '')
              ) AS region,
              COALESCE(
                NULLIF(TRIM(d.departement), ''),
                NULLIF(TRIM(u.departement), ''),
                NULLIF(TRIM(h_d.departement), ''),
                CASE
                  WHEN d.location IS NOT NULL
                    AND d.location !~* '^\\s*gps\\s*:'
                    AND d.location !~ '^\\s*-?\\d+(\\.\\d+)?\\s*[,;]\\s*-?\\d+(\\.\\d+)?\\s*$'
                  THEN NULLIF(TRIM(d.location), '')
                  ELSE NULL
                END
              ) AS departement,
              COALESCE(NULLIF(TRIM(d.arrondissement), ''), NULLIF(TRIM(u.arrondissement), '')) AS arrondissement,
              COALESCE(NULLIF(TRIM(d.commune), ''), NULLIF(TRIM(u.commune), '')) AS commune,
              d.espece_id AS species_id,
              d.nom_espece,
              d.nom_scientifique,
              d.quantity,
              d.lat,
              d.lon,
              d.hunter_id,
              d.permit_id,
              d.permit_number,
              d.category,
              CASE
                WHEN d.guide_id IS NOT NULL OR LOWER(COALESCE(u.role::text, '')) = 'hunting-guide' THEN 'Guide'
                ELSE 'Chasseur'
              END AS declared_by
            FROM declaration_especes d
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN hunters h_d ON h_d.id = d.hunter_id
            WHERE (d.status IS NULL OR d.status = 'pending')

            UNION ALL

            SELECT
              COALESCE(
                NULLIF(TRIM(ha.region), ''),
                NULLIF(TRIM(d_src.region), ''),
                NULLIF(TRIM(u_src.region), ''),
                NULLIF(TRIM(h_ha.region), '')
              ) AS region,
              COALESCE(
                NULLIF(TRIM(d_src.departement), ''),
                NULLIF(TRIM(u_src.departement), ''),
                NULLIF(TRIM(h_ha.departement), ''),
                CASE
                  WHEN ha.location IS NOT NULL
                    AND ha.location !~* '^\\s*gps\\s*:'
                    AND ha.location !~ '^\\s*-?\\d+(\\.\\d+)?\\s*[,;]\\s*-?\\d+(\\.\\d+)?\\s*$'
                  THEN NULLIF(TRIM(ha.location), '')
                  ELSE NULL
                END
              ) AS departement,
              COALESCE(NULLIF(TRIM(d_src.arrondissement), ''), NULLIF(TRIM(u_src.arrondissement), '')) AS arrondissement,
              COALESCE(NULLIF(TRIM(d_src.commune), ''), NULLIF(TRIM(u_src.commune), '')) AS commune,
              ha.species_id,
              ha.species_name AS nom_espece,
              ha.scientific_name AS nom_scientifique,
              ha.quantity,
              ha.lat,
              ha.lon,
              COALESCE(ha.hunter_id, d_src.hunter_id) AS hunter_id,
              ha.permit_id,
              ha.permit_number,
              d_src.category,
              CASE
                WHEN d_src.guide_id IS NOT NULL OR LOWER(COALESCE(u_src.role::text, '')) = 'hunting-guide' THEN 'Guide'
                ELSE 'Chasseur'
              END AS declared_by
            FROM hunting_activities ha
            LEFT JOIN declaration_especes d_src ON ha.source_id = d_src.id
            LEFT JOIN users u_src ON u_src.id = d_src.user_id
            LEFT JOIN hunters h_ha ON h_ha.id = ha.hunter_id
          ) x
          LEFT JOIN especes e ON (e.id::text = x.species_id::text OR LOWER(TRIM(e.nom)) = LOWER(TRIM(x.nom_espece)))
          LEFT JOIN permits p ON (p.id = x.permit_id OR (x.permit_id IS NULL AND p.permit_number = x.permit_number))
          LEFT JOIN hunters h_reg ON h_reg.id = COALESCE(x.hunter_id, p.hunter_id)
          LEFT JOIN users u_hc ON u_hc.id = h_reg.created_by_user_id
          LEFT JOIN users u_hu ON u_hu.hunter_id = h_reg.id
          LEFT JOIN LATERAL (
            SELECT u_hi.region, u_hi.departement, u_hi.arrondissement, u_hi.commune
            FROM history hi
            INNER JOIN users u_hi ON u_hi.id = hi.user_id
            WHERE hi.entity_type = 'hunter'
              AND hi.operation = 'create_hunter'
              AND hi.entity_id = h_reg.id
            ORDER BY hi.id ASC
            LIMIT 1
          ) u_hhist ON true
          WHERE COALESCE(x.quantity, 0) > 0
          ORDER BY region ASC, species_id ASC` as any
    ) as any;

    const isGpsText = (val?: string | null) => {
      if (!val) return false;
      const s = val.trim();
      return /^gps\s*:/i.test(s) || /^-?\d+(\.\d+)?\s*[,;]\s*-?\d+(\.\d+)?$/.test(s);
    };

    const geoCache = new Map<string, { region: string | null; departement: string | null; arrondissement: string | null; commune: string | null }>();
    const rawRows = Array.isArray(rows) ? rows : ((rows as any)?.rows || []);
    const data = await Promise.all(
      rawRows.map(async (r: any) => {
        const lat = r.lat != null && r.lat !== '' ? Number(r.lat) : null;
        const lon = r.lon != null && r.lon !== '' ? Number(r.lon) : null;
        let dept = r.departement && !isGpsText(String(r.departement)) ? String(r.departement).trim() : null;
        let arr = r.arrondissement ? String(r.arrondissement).trim() : null;
        let com = r.commune ? String(r.commune).trim() : null;
        let reg = r.region && !isGpsText(String(r.region)) ? String(r.region).trim() : null;

        if ((!dept || !arr || !reg || reg === 'nondefini') && lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
          const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
          let resolved = geoCache.get(cacheKey);
          if (!resolved) {
            try {
              const areas = await resolveAdministrativeAreas(lat, lon);
              resolved = {
                region: areas.region || null,
                departement: areas.departement || null,
                arrondissement: areas.arrondissement || null,
                commune: areas.commune || null,
              };
            } catch {
              resolved = { region: null, departement: null, arrondissement: null, commune: null };
            }
            geoCache.set(cacheKey, resolved);
          }
          if (!dept && resolved.departement) dept = resolved.departement;
          if (!arr && resolved.arrondissement) arr = resolved.arrondissement;
          if (!com && resolved.commune) com = resolved.commune;
          if ((!reg || reg === 'nondefini') && resolved.region) reg = resolved.region;
        }

        return {
          region: canonicalRegionName(reg),
          departement: dept,
          arrondissement: arr,
          commune: com,
          speciesId: r.species_id,
          speciesName: r.nom_espece || undefined,
          scientificName: r.nom_scientifique || undefined,
          quantity: Number(r.quantity || 0),
          lat,
          lon,
          permitNumber: r.permit_number ? String(r.permit_number).trim() : null,
          declaredBy: r.declared_by || 'Chasseur',
          category: r.category ? String(r.category).trim() : null,
          hunterRegisteredRegion: r.hunter_reg_region ? canonicalRegionName(r.hunter_reg_region) : null,
          hunterRegisteredDepartement: r.hunter_reg_dept ? String(r.hunter_reg_dept).trim() : null,
          hunterRegisteredArrondissement: r.hunter_reg_arr ? String(r.hunter_reg_arr).trim() : null,
          hunterRegisteredCommune: r.hunter_reg_com ? String(r.hunter_reg_com).trim() : null,
        };
      })
    );

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/species-by-region:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des prélèvements par espèce et par région' });
  }
});

// GET /api/stats/regional/permits-by-category - Groupement des permis par catégorie pour une région (par émetteur)
router.get('/regional/permits-by-category', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const data = await db
      .select({
        categoryId: permits.categoryId,
        count: count(),
        totalAmount: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)`,
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`)
      .groupBy(permits.categoryId);

    return res.json(
      (data || []).map((p: any) => ({
        categoryId: p.categoryId || 'non défini',
        count: Number(p.count || 0),
        totalAmount: Number(p.totalAmount || 0),
      }))
    );
  } catch (error) {
    console.error('Erreur regional/permits-by-category:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des permis par catégorie (région)' });
  }
});

// GET /api/stats/regional/hunters-by-category - Groupement des chasseurs par catégorie pour une région (par chasseur)
router.get('/regional/hunters-by-category', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const data = await db
      .select({
        category: hunters.category,
        count: count(),
      })
      .from(hunters)
      .where(sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`)
      .groupBy(hunters.category);

    return res.json(
      (data || []).map((h: any) => ({
        category: h.category || 'non défini',
        count: Number(h.count || 0),
      }))
    );
  } catch (error) {
    console.error('Erreur regional/hunters-by-category:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des chasseurs par catégorie (région)' });
  }
});

// GET /api/stats/admin/overview - agrégats globaux pour l'Admin
router.get('/admin/overview', isAuthenticated, async (req, res) => {
  try {
    // Récupérer le domaine actif depuis le header X-Domain
    const domainHeader = String((req.headers as any)['x-domain'] || '').toUpperCase().trim();

    // Compter les agents associés au domaine actif (via user_domains)
    // Si un domaine est spécifié, on filtre ; sinon on compte tout
    let agentsCountQuery;
    if (domainHeader) {
      agentsCountQuery = db
        .select({ count: sql<number>`count(DISTINCT ${users.id})` })
        .from(users)
        .innerJoin(userDomains, eq(userDomains.userId, users.id))
        .where(
          and(
            or(eq(users.role, 'agent'), eq(users.role, 'sub-agent'), eq(users.role, 'admin')),
            eq(sql`UPPER(${userDomains.domain})`, domainHeader),
            eq(userDomains.active, true)
          )
        );
    } else {
      agentsCountQuery = db.select({ count: count() }).from(users).where(or(eq(users.role, 'agent'), eq(users.role, 'sub-agent')));
    }

    // Comptes globaux
    const [
      agentsCountRes,
      guidesCountRes,
      huntersCountRes,
      alertsCount,
      permitsByCategory,
      huntersByCategory,
      recentActivities,
    ] = await Promise.all([
      agentsCountQuery,
      db.select({ count: count() }).from(users).where(eq(users.role, 'hunting-guide')),
      db.select({ count: count() }).from(hunters),
      db.select({ count: count() }).from(alerts),
      // Permis par catégorie avec cumul montant
      db
        .select({
          categoryId: permits.categoryId,
          count: count(),
          totalAmount: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)`,
        })
        .from(permits)
        .groupBy(permits.categoryId),
      // Chasseurs par catégorie
      db
        .select({
          category: hunters.category,
          count: count(),
        })
        .from(hunters)
        .groupBy(hunters.category),
      // Activités récentes (10 dernières)
      db
        .select({
          id: history.id,
          operation: history.operation,
          entityType: history.entityType,
          entityId: history.entityId,
          details: history.details,
          createdAt: history.createdAt,
          userId: history.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(history)
        .leftJoin(users, eq(history.userId, users.id))
        .orderBy(desc(history.createdAt))
        .limit(10),
    ]);

    const response = {
      domain: domainHeader || null,
      counts: {
        agents: agentsCountRes[0]?.count || 0,
        guides: guidesCountRes[0]?.count || 0,
        hunters: huntersCountRes[0]?.count || 0,
        alerts: alertsCount[0]?.count || 0,
      },
      permitsByCategory: (permitsByCategory || []).map((p: any) => ({
        categoryId: p.categoryId || 'non défini',
        count: Number(p.count || 0),
        totalAmount: Number(p.totalAmount || 0),
      })),
      huntersByCategory: (huntersByCategory || []).map((h: any) => ({
        category: h.category || 'non défini',
        count: Number(h.count || 0),
      })),
      recentActivities: (recentActivities || []).map((a: any) => ({
        id: a.id,
        operation: a.operation,
        entityType: a.entityType,
        entityId: a.entityId,
        details: a.details,
        createdAt: a.createdAt,
        user: a.userId ? {
          id: a.userId,
          firstName: a.firstName,
          lastName: a.lastName,
          role: a.role,
        } : null,
      })),
    };

    return res.json(response);
  } catch (error: any) {
    console.error('Erreur /api/stats/admin/overview:', error);
    return res.status(500).json({ 
      message: "Erreur lors de la récupération des statistiques d'administration",
      error: error?.message || String(error),
      stack: error?.stack
    });
  }
});

// GET /api/stats/regional/taxes-by-month - Nombre de taxes par mois (12 derniers mois)
router.get('/regional/taxes-by-month', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const data = await db
      .select({
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${taxes.issueDate}), 'Mon')`,
        yearMonth: sql<string>`TO_CHAR(DATE_TRUNC('month', ${taxes.issueDate}), 'YYYY-MM')`,
        count: count(),
        amount: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)`,
      })
      .from(taxes)
      .innerJoin(users, eq(taxes.createdBy, users.id))
      .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region})) AND ${taxes.issueDate} >= (CURRENT_DATE - INTERVAL '12 months')`)
      .groupBy(sql`DATE_TRUNC('month', ${taxes.issueDate})`)
      .orderBy(desc(sql`DATE_TRUNC('month', ${taxes.issueDate})`));

    return res.json(data);
  } catch (error) {
    console.error('Erreur taxes-by-month:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des taxes par mois' });
  }
});

// GET /api/stats/regional/infractions-by-month - Nombre d'infractions par mois (12 derniers mois)
router.get('/regional/infractions-by-month', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const rows: Array<{ month: string; yearMonth: string; count: number }> = await db.execute(
      sql`SELECT
             TO_CHAR(DATE_TRUNC('month', i.date_infraction), 'Mon') AS month,
             TO_CHAR(DATE_TRUNC('month', i.date_infraction), 'YYYY-MM') AS "yearMonth",
             COUNT(*)::int AS count
           FROM infractions i
           INNER JOIN users u ON u.id = i.created_by
           WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))
             AND i.date_infraction >= (CURRENT_DATE - INTERVAL '12 months')
           GROUP BY DATE_TRUNC('month', i.date_infraction)
           ORDER BY DATE_TRUNC('month', i.date_infraction) DESC` as any,
    ) as any;

    return res.json(rows || []);
  } catch (error) {
    console.error('Erreur infractions-by-month:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des infractions par mois' });
  }
});

// GET /api/stats/regional - Agrégats par région basés sur l'émetteur (created_by)
router.get('/regional', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    const period = String(req.query.period || 'all');
    if (!region) {
      return res.status(400).json({ message: 'Paramètre region manquant' });
    }

    // Filtre: agents régionaux et agents de secteur de la même région (case-insensitive)
    const issuerFilter = and(
      sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`,
      or(eq(users.role, 'agent'), eq(users.role, 'sub-agent'))
    );

    // Filtre période sur issueDate
    let dateFilter = sql`1=1`;
    if (period === 'current_year') {
      dateFilter = sql`DATE_PART('year', ${permits.issueDate}) = DATE_PART('year', CURRENT_DATE)`;
    } else if (period === 'current_month') {
      dateFilter = sql`DATE_TRUNC('month', ${permits.issueDate}) = DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'current_campaign') {
      // Si une table campagne existe, ajuster ici. Par défaut: année en cours.
      dateFilter = sql`DATE_PART('year', ${permits.issueDate}) = DATE_PART('year', CURRENT_DATE)`;
    }

    // Debug minimal
    console.log('[STATS REGIONAL] region=', region, ' period=', period);

    // Comptes de base
    const [
      hunterCount,
      activePermitCount,
      expiredPermitCount,
      suspendedPermitCount,
      pendingRequests,
      permitRevenue,
      taxesAmount,
      taxCount,
      infractionsAmount,
      infractionsCount,
      contrevenantsCount,
    ] = await Promise.all([
      // Chasseurs créés par des agents/sub-agents de la même région (via history)
      db
        .select({ count: sql<number>`COUNT(DISTINCT ${history.entityId})` })
        .from(history)
        .innerJoin(users, eq(history.userId, users.id))
        .where(and(
          eq(history.entityType, 'hunter'),
          eq(history.operation, 'create_hunter'),
          issuerFilter,
        )),

      // Permis actifs émis par les agents de la région (created_by)
      db
        .select({ count: count() })
        .from(permits)
        .innerJoin(users, eq(permits.createdBy, users.id))
        .where(and(eq(permits.status, 'active'), issuerFilter, dateFilter)),

      // Permis expirés émis par les agents de la région
      db
        .select({ count: count() })
        .from(permits)
        .innerJoin(users, eq(permits.createdBy, users.id))
        .where(and(eq(permits.status, 'expired'), issuerFilter, dateFilter)),

      // Permis suspendus émis par les agents de la région
      db
        .select({ count: count() })
        .from(permits)
        .innerJoin(users, eq(permits.createdBy, users.id))
        .where(and(eq(permits.status, 'suspended'), issuerFilter, dateFilter)),

      // Demandes en attente pour des chasseurs de la région
      db
        .select({ count: count() })
        .from(permitRequests)
        .innerJoin(hunters, eq(permitRequests.hunterId, hunters.id))
        .where(and(eq(permitRequests.status, 'pending'), sql`LOWER(${hunters.region}) = LOWER(TRIM(${region}))`)),

      // Revenu permis émis par agents/sub-agents de la région
      db
        .select({ total: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)` })
        .from(permits)
        .innerJoin(users, eq(permits.createdBy, users.id))
        .where(and(issuerFilter, dateFilter)),

      // Montant total des taxes enregistrées par agents/sub-agents de la région
      db
        .select({ total: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)` })
        .from(taxes)
        .innerJoin(users, eq(taxes.createdBy, users.id))
        .where(and(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`, dateFilter)),

      // Nombre total de taxes enregistrées par agents/sub-agents de la région
      db
        .select({ count: count() })
        .from(taxes)
        .innerJoin(users, eq(taxes.createdBy, users.id))
        .where(and(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`, dateFilter)),

      // Montant total des infractions enregistrées par agents/sub-agents de la région
      db.execute(
        sql`SELECT COALESCE(SUM((i.montant_chiffre)::numeric), 0) AS total
            FROM infractions i
            INNER JOIN users u ON u.id = i.created_by
            WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))` as any,
      ),

      // Nombre total d'infractions (PV) enregistrées par agents/sub-agents de la région
      db.execute(
        sql`SELECT COUNT(*)::int AS count
            FROM infractions i
            INNER JOIN users u ON u.id = i.created_by
            WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))` as any,
      ),

      // Nombre de contrevenants associés à des infractions créées par des agents/sub-agents de la région
      db.execute(
        sql`SELECT COUNT(DISTINCT ci.contrevenant_id) AS count
            FROM contrevenants_infractions ci
            INNER JOIN infractions i ON i.id = ci.infraction_id
            INNER JOIN users u ON u.id = i.created_by
            WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))` as any,
      ),
    ]);

    const permitRev = Number((permitRevenue[0] as any)?.total || 0);
    const taxesRev = Number((taxesAmount[0] as any)?.total || 0);
    const infraRev = Array.isArray(infractionsAmount)
      ? Number(((infractionsAmount[0] as any)?.total) || 0)
      : Number((infractionsAmount as any)[0]?.total || 0);
    const revenue = permitRev + taxesRev + infraRev;

    const infractionCount = Array.isArray(infractionsCount)
      ? Number(((infractionsCount[0] as any)?.count) || 0)
      : Number((infractionsCount as any)[0]?.count || 0);

    const contrevenantCount = Array.isArray(contrevenantsCount)
      ? Number(((contrevenantsCount[0] as any)?.count) || 0)
      : Number((contrevenantsCount as any)[0]?.count || 0);

    return res.json({
      hunterCount: hunterCount[0]?.count || 0,
      contrevenantCount,
      activePermitCount: activePermitCount[0]?.count || 0,
      expiredPermitCount: expiredPermitCount[0]?.count || 0,
      suspendedPermitCount: suspendedPermitCount[0]?.count || 0,
      pendingRequests: pendingRequests[0]?.count || 0,
      taxCount: taxCount[0]?.count || 0,
      infractionCount,
      infractionRevenue: infraRev,
      revenue,
    });
  } catch (error) {
    console.error('Erreur stats régionales (regional):', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques régionales' });
  }
});

// GET /api/stats/regional/permits-by-month - Nombre de permis par mois (12 derniers mois)
router.get('/regional/permits-by-month', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const data = await db
      .select({
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${permits.issueDate}), 'Mon')`,
        yearMonth: sql<string>`TO_CHAR(DATE_TRUNC('month', ${permits.issueDate}), 'YYYY-MM')`,
        count: count(),
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region})) AND ${permits.issueDate} >= (CURRENT_DATE - INTERVAL '12 months')`)
      .groupBy(sql`DATE_TRUNC('month', ${permits.issueDate})`)
      .orderBy(desc(sql`DATE_TRUNC('month', ${permits.issueDate})`));

    return res.json(data);
  } catch (error) {
    console.error('Erreur permits-by-month:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des permis par mois' });
  }
});

// GET /api/stats/regional/revenue-by-type - Répartition des revenus entre permis et taxes
router.get('/regional/revenue-by-type', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const [permitRevenue, taxesRevenue, infractionsRevenue] = await Promise.all([
      db
        .select({ total: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)` })
        .from(permits)
        .innerJoin(users, eq(permits.createdBy, users.id))
        .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`),
      db
        .select({ total: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)` })
        .from(taxes)
        .innerJoin(users, eq(taxes.createdBy, users.id))
        .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`),
      db.execute(
        sql`SELECT COALESCE(SUM((i.montant_chiffre)::numeric), 0) AS total
            FROM infractions i
            INNER JOIN users u ON u.id = i.created_by
            WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))` as any,
      ),
    ]);

    const data = [
      { name: 'Permis', value: Number((permitRevenue[0] as any)?.total || 0) },
      { name: "Taxes d'abattage", value: Number((taxesRevenue[0] as any)?.total || 0) },
      { name: 'Infractions', value: Array.isArray(infractionsRevenue)
          ? Number(((infractionsRevenue[0] as any)?.total) || 0)
          : Number((infractionsRevenue as any)[0]?.total || 0)
      },
    ];
    return res.json(data);
  } catch (error) {
    console.error('Erreur revenue-by-type:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des revenus par type' });
  }
});

// GET /api/stats/regional/revenue-by-type-export - Export CSV/Excel (avec département/IREF)
router.get('/regional/revenue-by-type-export', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const irefLabel = `IREF ${region}`;

    const data = await db.execute(
      sql`
        SELECT
          COALESCE(NULLIF(TRIM(x.departement), ''), ${irefLabel}) AS departement,
          x.type,
          x.montant
        FROM (
          SELECT
            TRIM(u.departement) AS departement,
            'Permis'::text AS type,
            COALESCE(SUM((p.price)::numeric), 0) AS montant
          FROM permits p
          INNER JOIN users u ON u.id = p.created_by
          WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))
          GROUP BY TRIM(u.departement)

          UNION ALL

          SELECT
            TRIM(u.departement) AS departement,
            'Taxes d''abattage'::text AS type,
            COALESCE(SUM((t.amount)::numeric), 0) AS montant
          FROM taxes t
          INNER JOIN users u ON u.id = t.created_by
          WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))
          GROUP BY TRIM(u.departement)

          UNION ALL

          SELECT
            TRIM(u.departement) AS departement,
            'Infractions'::text AS type,
            COALESCE(SUM((i.montant_chiffre)::numeric), 0) AS montant
          FROM infractions i
          INNER JOIN users u ON u.id = i.created_by
          WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))
          GROUP BY TRIM(u.departement)
        ) x
      ` as any,
    );

    const rows = Array.isArray(data) ? (data as any) : (data as any)?.rows;
    return res.json(rows || []);
  } catch (error) {
    console.error('Erreur revenue-by-type-export:', error);
    return res.status(500).json({ message: "Erreur lors de l'export des revenus par type" });
  }
});

// GET /api/stats/regional/tax-distribution - Distribution des taxes par espèce
router.get('/regional/tax-distribution', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const data = await db
      .select({
        name: taxes.animalType,
        count: count(),
        amount: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)`,
      })
      .from(taxes)
      .innerJoin(users, eq(taxes.createdBy, users.id))
      .where(sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`)
      .groupBy(taxes.animalType);

    return res.json(data);
  } catch (error) {
    console.error('Erreur tax-distribution:', error);
    return res.status(500).json({ message: "Erreur lors de la récupération de la distribution des taxes" });
  }
});

// GET /api/stats/regional/taxes-export - Export CSV/Excel des taxes (détails + département/IREF)
router.get('/regional/taxes-export', isAuthenticated, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    if (!region) return res.status(400).json({ message: 'Paramètre region manquant' });

    const irefLabel = `IREF ${region}`;

    const data = await db.execute(
      sql`
        SELECT
          COALESCE(NULLIF(TRIM(u.departement), ''), ${irefLabel}) AS departement,
          t.tax_number AS "taxNumber",
          t.issue_date AS "issueDate",
          t.animal_type AS "animalType",
          t.quantity AS "quantity",
          t.amount AS "amount",
          t.receipt_number AS "receiptNumber",
          t.hunter_name_snapshot AS "hunterNameSnapshot",
          t.permit_number_snapshot AS "permitNumberSnapshot",
          t.permit_category_snapshot AS "permitCategorySnapshot",
          t.issuer_service_snapshot AS "issuerServiceSnapshot",
          t.external_hunter_name AS "externalHunterName",
          t.external_hunter_region AS "externalHunterRegion",
          t.created_at AS "createdAt"
        FROM taxes t
        INNER JOIN users u ON u.id = t.created_by
        WHERE LOWER(TRIM(u.region)) = LOWER(TRIM(${region}))
        ORDER BY t.created_at DESC
      ` as any,
    );

    const rows = Array.isArray(data) ? (data as any) : (data as any)?.rows;
    return res.json(rows || []);
  } catch (error) {
    console.error('Erreur taxes-export:', error);
    return res.status(500).json({ message: "Erreur lors de l'export des taxes" });
  }
});

// GET /api/stats/region/:region - Récupérer les statistiques pour une région spécifique
router.get('/region/:region', isAuthenticated, async (req, res) => {
  try {
    const { region } = req.params;

    // Récupérer les statistiques pour la région spécifiée
    const [
      regionHuntersCount,
      regionPermitsCount,
      regionActivePermitsCount,
      regionPendingRequestsCount,
      regionGuidesCount,
      regionPermitRevenue,
      regionTaxesAmount,
      regionTaxesCount
    ] = await Promise.all([
      // Nombre de chasseurs par région
      db.select({ count: count() }).from(hunters).where(sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`),

      // Nombre de permis liés aux chasseurs de la région
      db.select({ count: count() })
        .from(permits)
        .innerJoin(hunters, eq(permits.hunterId, hunters.id))
        .where(sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`),

      // Nombre de permis actifs liés aux chasseurs de la région
      db.select({ count: count() })
        .from(permits)
        .innerJoin(hunters, eq(permits.hunterId, hunters.id))
        .where(and(eq(permits.status, 'active'), sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`)),

      // Nombre de demandes de permis en attente pour des chasseurs de la région
      db.select({ count: count() })
        .from(permitRequests)
        .innerJoin(hunters, eq(permitRequests.hunterId, hunters.id))
        .where(and(eq(permitRequests.status, 'pending'), sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`)),

      // Nombre de guides dans la région (via table users)
      db.select({ count: count() }).from(users).where(and(eq(users.role, 'hunting-guide'), sql`LOWER(TRIM(${users.region})) = LOWER(TRIM(${region}))`)),

      // Revenu total des permis pour la région (somme des prix des permis des chasseurs de la région)
      db
        .select({ total: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)` })
        .from(permits)
        .innerJoin(hunters, eq(permits.hunterId, hunters.id))
        .where(sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`),

      // Montant total des taxes d'abattage pour la région
      db
        .select({ total: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)` })
        .from(taxes)
        .leftJoin(hunters, eq(taxes.hunterId, hunters.id))
        .where(
          or(
            sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`,
            sql`LOWER(TRIM(${taxes.externalHunterRegion})) = LOWER(TRIM(${region}))`
          )
        ),

      // Nombre total d'enregistrements de taxes pour la région
      db
        .select({ count: count() })
        .from(taxes)
        .leftJoin(hunters, eq(taxes.hunterId, hunters.id))
        .where(
          or(
            sql`LOWER(TRIM(${hunters.region})) = LOWER(TRIM(${region}))`,
            sql`LOWER(TRIM(${taxes.externalHunterRegion})) = LOWER(TRIM(${region}))`
          )
        ),
    ]);

    // Construire l'objet de statistiques régionales
    const regionStats = {
      hunters: regionHuntersCount[0]?.count || 0,
      permits: regionPermitsCount[0]?.count || 0,
      activePermits: regionActivePermitsCount[0]?.count || 0,
      pendingRequests: regionPendingRequestsCount[0]?.count || 0,
      guides: regionGuidesCount[0]?.count || 0,
      permitRevenue: (regionPermitRevenue[0] as any)?.total || 0,
      taxesAmount: (regionTaxesAmount[0] as any)?.total || 0,
      taxesCount: regionTaxesCount[0]?.count || 0,
    };

    return res.json(regionStats);
  } catch (error) {
    console.error(`Erreur lors de la récupération des statistiques pour la région ${req.params.region}:`, error);
    return res.status(500).json({
      message: `Erreur lors de la récupération des statistiques pour la région ${req.params.region}`
    });
  }
});

// GET /api/stats/national - Récupérer les statistiques nationales (alias pour /api/stats)
router.get('/national', isAuthenticated, async (req, res) => {
  try {
    // Récupérer les statistiques de base (même logique que la route principale)
    const [
      huntersCount,
      permitsCount,
      activePermitsCount,
      pendingRequestsCount,
      guidesCount,
      agentsCount
    ] = await Promise.all([
      db.select({ count: count() }).from(hunters),
      db.select({ count: count() }).from(permits),
      db.select({ count: count() }).from(permits).where(eq(permits.status, 'active')),
      db.select({ count: count() }).from(permitRequests).where(eq(permitRequests.status, 'pending')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'hunting-guide')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'agent'))
    ]);

    // Construire l'objet de statistiques nationales
    const nationalStats = {
      hunters: huntersCount[0]?.count || 0,
      permits: permitsCount[0]?.count || 0,
      activePermits: activePermitsCount[0]?.count || 0,
      pendingRequests: pendingRequestsCount[0]?.count || 0,
      guides: guidesCount[0]?.count || 0,
      agents: agentsCount[0]?.count || 0
    };

    return res.json(nationalStats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques nationales:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques nationales' });
  }
});

// GET /api/stats/national/aggregates - Statistiques nationales détaillées (réelles)
router.get('/national/aggregates', isAuthenticated, async (req, res) => {
  try {
    const [
      huntersCount,
      permitsCount,
      activePermitsCount,
      expiredPermitsCount,
      guidesCount,
      permitRevenue,
      taxesAmount,
      taxCount,
      totalPieces,
      infractionsCount
    ] = await Promise.all([
      db.select({ count: count() }).from(hunters),
      db.select({ count: count() }).from(permits),
      db.select({ count: count() }).from(permits).where(eq(permits.status, 'active')),
      db.select({ count: count() }).from(permits).where(eq(permits.status, 'expired')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'hunting-guide')),
      db.select({ total: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)` }).from(permits),
      db.select({ total: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)` }).from(taxes),
      db.select({ count: count() }).from(taxes),
      // Pièces abattues: cumul des déclarations en attente et des activités validées
      db.execute(sql`
        SELECT COALESCE(SUM(quantity), 0) AS total
        FROM (
          SELECT quantity FROM declaration_especes WHERE status IS NULL OR status = 'pending'
          UNION ALL
          SELECT quantity FROM hunting_activities
        ) x
      ` as any),
      // Compteur d'infractions (PV) - utiliser la vraie table infractions
      db.execute(sql`SELECT COUNT(*) as count FROM infractions` as any),
    ]);

    const revenue = Number((permitRevenue[0] as any)?.total || 0) + Number((taxesAmount[0] as any)?.total || 0);

    // totalPieces provient d'une requête execute() qui renvoie un tableau de lignes
    const totalPiecesValue = Array.isArray(totalPieces) ? Number((totalPieces[0] as any)?.total || 0) : Number((totalPieces as any)[0]?.total || 0);

    // infractionsCount provient d'une requête execute() qui renvoie un tableau de lignes
    const infractionsCountValue = Array.isArray(infractionsCount) ? Number((infractionsCount[0] as any)?.count || 0) : Number((infractionsCount as any)[0]?.count || 0);

    return res.json({
      hunterCount: huntersCount[0]?.count || 0,
      permitCount: permitsCount[0]?.count || 0,
      activePermitCount: activePermitsCount[0]?.count || 0,
      expiredPermitCount: expiredPermitsCount[0]?.count || 0,
      guidesCount: guidesCount[0]?.count || 0,
      taxCount: taxCount[0]?.count || 0,
      revenue,
      totalPiecesAbattues: totalPiecesValue,
      infractionsCount: infractionsCountValue,
    });
  } catch (error: any) {
    console.error('Erreur /api/stats/national/aggregates:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des agrégats nationaux', debug: error?.message || String(error), stack: error?.stack });
  }
});

// GET /api/stats/national/revenue-by-month - évolution mensuelle des recettes (permits + taxes + infractions)
router.get('/national/revenue-by-month', isAuthenticated, async (_req, res) => {
  try {
    const rows: Array<{
      month_key: string;
      permit_amount: string | number | null;
      tax_amount: string | number | null;
      infraction_amount: string | number | null;
    }> = await db.execute(
      sql`WITH monthly AS (
            SELECT date_trunc('month', issue_date::date) AS month,
                   SUM((price)::numeric) AS permit_amount,
                   0::numeric AS tax_amount,
                   0::numeric AS infraction_amount
            FROM permits
            GROUP BY 1
            UNION ALL
            SELECT date_trunc('month', issue_date::date) AS month,
                   0::numeric AS permit_amount,
                   SUM((amount)::numeric) AS tax_amount,
                   0::numeric AS infraction_amount
            FROM taxes
            GROUP BY 1
            UNION ALL
            SELECT date_trunc('month', date_infraction::date) AS month,
                   0::numeric AS permit_amount,
                   0::numeric AS tax_amount,
                   SUM(COALESCE(montant_chiffre::numeric, 0)) AS infraction_amount
            FROM infractions
            GROUP BY 1
          )
          SELECT
            TO_CHAR(month, 'YYYY-MM') AS month_key,
            SUM(permit_amount) AS permit_amount,
            SUM(tax_amount) AS tax_amount,
            SUM(infraction_amount) AS infraction_amount
          FROM monthly
          WHERE month IS NOT NULL
            AND month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '17 months'
          GROUP BY month
          ORDER BY month` as any
    ) as any;

    const data = (rows || []).map((row) => ({
      monthKey: row.month_key,
      permitAmount: Number(row.permit_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      infractionAmount: Number(row.infraction_amount || 0),
    }));

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/revenue-by-month:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des recettes mensuelles' });
  }
});

// GET /api/stats/sector/revenue-by-month - évolution mensuelle des recettes pour un agent de secteur (permits + taxes + infractions)
router.get('/sector/revenue-by-month', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }

    const rows: Array<{
      month_key: string;
      permit_amount: string | number | null;
      tax_amount: string | number | null;
      infraction_amount: string | number | null;
    }> = await db.execute(
      sql`WITH monthly AS (
              SELECT date_trunc('month', issue_date::date) AS month,
                     SUM((price)::numeric) AS permit_amount,
                     0::numeric AS tax_amount,
                     0::numeric AS infraction_amount
              FROM permits
              WHERE created_by = ${userId}
              GROUP BY 1
              UNION ALL
              SELECT date_trunc('month', issue_date::date) AS month,
                     0::numeric AS permit_amount,
                     SUM((amount)::numeric) AS tax_amount,
                     0::numeric AS infraction_amount
              FROM taxes
              WHERE created_by = ${userId}
              GROUP BY 1
              UNION ALL
              SELECT date_trunc('month', date_infraction::date) AS month,
                     0::numeric AS permit_amount,
                     0::numeric AS tax_amount,
                     SUM(COALESCE(montant_chiffre::numeric, 0)) AS infraction_amount
              FROM infractions
              WHERE created_by = ${userId}
              GROUP BY 1
            )
            SELECT
              TO_CHAR(month, 'YYYY-MM') AS month_key,
              SUM(permit_amount) AS permit_amount,
              SUM(tax_amount) AS tax_amount,
              SUM(infraction_amount) AS infraction_amount
            FROM monthly
            WHERE month IS NOT NULL
              AND month >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '17 months'
            GROUP BY month
            ORDER BY month` as any
    ) as any;

    const data = (rows || []).map((row) => ({
      monthKey: row.month_key,
      permitAmount: Number(row.permit_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      infractionAmount: Number(row.infraction_amount || 0),
    }));

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/sector/revenue-by-month:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des recettes mensuelles du secteur' });
  }
});

// GET /api/stats/national/revenue-by-department - évolution des recettes par département (permits + taxes + infractions)
router.get('/national/revenue-by-department', isAuthenticated, async (_req, res) => {
  try {
    const rows: Array<{
      region: string | null;
      departement: string | null;
      permit_amount: string | number | null;
      tax_amount: string | number | null;
      infraction_amount: string | number | null;
    }> = await db.execute(
      sql`WITH base AS (
              -- Permis: région/département pris depuis l'utilisateur émetteur (sub-agent)
              SELECT
                LOWER(TRIM(u.region)) AS region,
                LOWER(TRIM(u.departement)) AS departement,
                SUM((p.price)::numeric) AS permit_amount,
                0::numeric AS tax_amount,
                0::numeric AS infraction_amount
              FROM permits p
              INNER JOIN users u ON u.id = p.created_by
              WHERE u.role = 'sub-agent'
              GROUP BY 1, 2
              UNION ALL
              -- Taxes: région/département pris depuis l'utilisateur émetteur (sub-agent)
              SELECT
                LOWER(TRIM(u.region)) AS region,
                LOWER(TRIM(u.departement)) AS departement,
                0::numeric AS permit_amount,
                SUM((t.amount)::numeric) AS tax_amount,
                0::numeric AS infraction_amount
              FROM taxes t
              INNER JOIN users u ON u.id = t.created_by
              WHERE u.role = 'sub-agent'
              GROUP BY 1, 2
              UNION ALL
              -- Infractions: région/département pris depuis le lieu de l'infraction (lieux),
              -- afin de comptabiliser toutes les infractions enregistrées dans le département,
              -- quel que soit le rôle de l'utilisateur créateur.
              SELECT
                LOWER(TRIM(l.region)) AS region,
                LOWER(TRIM(l.departement)) AS departement,
                0::numeric AS permit_amount,
                0::numeric AS tax_amount,
                SUM(COALESCE(i.montant_chiffre::numeric, 0)) AS infraction_amount
              FROM infractions i
              LEFT JOIN lieux l ON l.id = i.lieu_id
              GROUP BY 1, 2
            )
            SELECT
              COALESCE(region, 'non défini') AS region,
              COALESCE(departement, 'non défini') AS departement,
              SUM(permit_amount) AS permit_amount,
              SUM(tax_amount) AS tax_amount,
              SUM(infraction_amount) AS infraction_amount
            FROM base
            GROUP BY 1, 2
            ORDER BY 1, 2` as any
    ) as any;

    const merged = new Map<string, { region: string; departement: string; permitAmount: number; taxAmount: number; infractionAmount: number }>();
    for (const row of rows || []) {
      const regKey = normalizeRegionKey(row.region);
      const regLabel = canonicalRegionName(row.region);
      const depKey = normalizeRegionKey(row.departement);
      const depLabel = row.departement ? String(row.departement).trim().toUpperCase() : 'Non défini';
      const key = `${regKey}::${depKey}`;
      const prev = merged.get(key) || { region: regLabel, departement: depLabel, permitAmount: 0, taxAmount: 0, infractionAmount: 0 };
      prev.permitAmount += Number(row.permit_amount || 0);
      prev.taxAmount += Number(row.tax_amount || 0);
      prev.infractionAmount += Number(row.infraction_amount || 0);
      merged.set(key, prev);
    }

    return res.json(Array.from(merged.values()));
  } catch (error: any) {
    console.error('Erreur /api/stats/national/revenue-by-department:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des recettes par département', debug: error?.message || String(error), stack: error?.stack });
  }
});

// GET /api/stats/national/revenue-chasse-matrix - Matrice détaillée des recettes liées à la gestion de la faune par région
router.get('/national/revenue-chasse-matrix', isAuthenticated, async (_req, res) => {
  try {
    const [permitRows, taxRows, infractionRows] = await Promise.all([
      db.execute(
        sql`SELECT
              COALESCE(
                NULLIF(TRIM(u.region), ''),
                NULLIF(TRIM(h.region), ''),
                'national'
              ) AS region,
              COALESCE(p.category_id, '') AS category_id,
              COALESCE(p.type, '') AS permit_type,
              COALESCE(pc.groupe, '') AS pc_groupe,
              COALESCE(pc.genre, '') AS pc_genre,
              COALESCE(pc.label_fr, '') AS pc_label,
              COALESCE(h.category, '') AS hunter_category,
              COALESCE(SUM((p.price)::numeric), 0) AS total_amount
            FROM permits p
            LEFT JOIN users u ON u.id = p.created_by
            LEFT JOIN hunters h ON h.id = p.hunter_id
            LEFT JOIN permit_categories pc ON pc.key = p.category_id
            GROUP BY 1, 2, 3, 4, 5, 6, 7` as any
      ),
      db.execute(
        sql`SELECT
              COALESCE(
                NULLIF(TRIM(u.region), ''),
                NULLIF(TRIM(t.external_hunter_region), ''),
                NULLIF(TRIM(h.region), ''),
                'national'
              ) AS region,
              COALESCE(t.animal_type, '') AS animal_type,
              COALESCE(e.groupe, '') AS espece_groupe,
              COALESCE(SUM((t.amount)::numeric), 0) AS total_amount
            FROM taxes t
            LEFT JOIN users u ON u.id = t.created_by
            LEFT JOIN hunters h ON h.id = t.hunter_id
            LEFT JOIN especes e ON (LOWER(TRIM(e.nom)) = LOWER(TRIM(t.animal_type)) OR e.id::text = t.animal_type)
            GROUP BY 1, 2, 3` as any
      ),
      db.execute(
        sql`SELECT
              COALESCE(
                NULLIF(TRIM(l.region), ''),
                NULLIF(TRIM(u.region), ''),
                'national'
              ) AS region,
              COALESCE(SUM(COALESCE(i.montant_chiffre::numeric, 0)), 0) AS total_amount
            FROM infractions i
            LEFT JOIN lieux l ON l.id = i.lieu_id
            LEFT JOIN users u ON u.id = i.created_by
            GROUP BY 1` as any
      ),
    ]);

    const norm = (s: any) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const pList = Array.isArray(permitRows) ? permitRows : (permitRows as any)?.rows || [];
    const tList = Array.isArray(taxRows) ? taxRows : (taxRows as any)?.rows || [];
    const iList = Array.isArray(infractionRows) ? infractionRows : (infractionRows as any)?.rows || [];

    const items: Array<{
      section: 'petite_chasse' | 'gibier_eau' | 'grande_chasse' | 'licence_taxe' | 'contentieux';
      rowLabel: string;
      regionKey: string;
      regionLabel: string;
      amount: number;
    }> = [];

    for (const r of pList) {
      const amount = Number(r.total_amount || 0);
      if (amount <= 0) continue;
      const regionKey = normalizeRegionKey(r.region);
      const regionLabel = canonicalRegionName(r.region);
      const combined = norm(`${r.category_id} ${r.permit_type} ${r.pc_groupe} ${r.pc_label}`);
      const genreStr = norm(`${r.pc_genre} ${r.category_id} ${r.permit_type} ${r.hunter_category}`);

      // Vérifier s'il s'agit d'un permis spécial / licence / attestation (Section 4)
      if (combined.includes('oisellerie')) {
        items.push({ section: 'licence_taxe', rowLabel: "Permis spécial d'oisellerie", regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('pisteur')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Attestation pisteur', regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('collecteur')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Attestation Collecteur', regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('ramasseur')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Taxe Ramasseur', regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('amodiation')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Taxe amodiation', regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('reserve')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Taxe réserve privée', regionKey, regionLabel, amount });
        continue;
      }
      if (combined.includes('licence') || combined.includes('guide')) {
        items.push({ section: 'licence_taxe', rowLabel: 'Licence', regionKey, regionLabel, amount });
        continue;
      }

      // Déterminer le sous-type de chasseur (Coutumier, Résident, Touriste)
      let subRow = 'Résident';
      if (genreStr.includes('coutum')) {
        subRow = 'Coutumier';
      } else if (genreStr.includes('touris') || genreStr.includes('passag')) {
        subRow = 'Touriste';
      }

      if (combined.includes('eau') || combined.includes('waterfowl')) {
        items.push({ section: 'gibier_eau', rowLabel: subRow, regionKey, regionLabel, amount });
      } else if (combined.includes('grande')) {
        items.push({ section: 'grande_chasse', rowLabel: subRow, regionKey, regionLabel, amount });
      } else {
        items.push({ section: 'petite_chasse', rowLabel: subRow, regionKey, regionLabel, amount });
      }
    }

    for (const r of tList) {
      const amount = Number(r.total_amount || 0);
      if (amount <= 0) continue;
      const regionKey = normalizeRegionKey(r.region);
      const regionLabel = canonicalRegionName(r.region);
      const animalNorm = norm(r.animal_type);
      const grpNorm = norm(r.espece_groupe);

      let rowLabel = 'Taxe phaco';
      if (animalNorm.includes('phaco') || animalNorm.includes('warthog')) {
        rowLabel = 'Taxe phaco';
      } else if (
        animalNorm.includes('grande') ||
        grpNorm.includes('grande') ||
        animalNorm.includes('cephalope') ||
        animalNorm.includes('guib') ||
        animalNorm.includes('buffle') ||
        animalNorm.includes('hippotrague') ||
        animalNorm.includes('cobe')
      ) {
        rowLabel = 'Taxe grande chasse';
      } else if (animalNorm.includes('pisteur')) {
        rowLabel = 'Attestation pisteur';
      } else if (animalNorm.includes('oisellerie')) {
        rowLabel = "Permis spécial d'oisellerie";
      } else if (animalNorm.includes('collecteur')) {
        rowLabel = 'Attestation Collecteur';
      } else if (animalNorm.includes('ramasseur')) {
        rowLabel = 'Taxe Ramasseur';
      } else if (animalNorm.includes('licence')) {
        rowLabel = 'Licence';
      } else if (animalNorm.includes('amodiation')) {
        rowLabel = 'Taxe amodiation';
      } else if (animalNorm.includes('reserve')) {
        rowLabel = 'Taxe réserve privée';
      } else if (r.animal_type && String(r.animal_type).trim()) {
        rowLabel = `Taxe ${String(r.animal_type).trim()}`;
      }

      items.push({ section: 'licence_taxe', rowLabel, regionKey, regionLabel, amount });
    }

    for (const r of iList) {
      const amount = Number(r.total_amount || 0);
      if (amount <= 0) continue;
      const regionKey = normalizeRegionKey(r.region);
      const regionLabel = canonicalRegionName(r.region);
      items.push({ section: 'contentieux', rowLabel: 'Contentieux', regionKey, regionLabel, amount });
    }

    return res.json(items);
  } catch (error: any) {
    console.error('Erreur /api/stats/national/revenue-chasse-matrix:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération de la matrice des recettes chasse' });
  }
});

// GET /api/stats/national/by-region - Agrégats par région (émetteur)
router.get('/national/by-region', isAuthenticated, async (req, res) => {
  try {
    // Permis actifs par région de l'émetteur
    const activePermitsByRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        count: count(),
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .where(eq(permits.status, 'active'))
      .groupBy(sql`LOWER(TRIM(${users.region}))`);

    // Pièces abattues (quantité) par région (émetteur de la déclaration ou région d'activité)
    const piecesByRegion: Array<{ region: string; pieces: number }> = await db.execute(
      sql`SELECT LOWER(TRIM(region)) AS region, COALESCE(SUM(pieces), 0) AS pieces
          FROM (
            SELECT LOWER(TRIM(u.region)) AS region, COALESCE(d.quantity, 0) AS pieces
            FROM declaration_especes d
            INNER JOIN users u ON u.id = d.user_id
            WHERE d.status IS NULL OR d.status = 'pending'

            UNION ALL

            SELECT LOWER(TRIM(ha.region)) AS region, COALESCE(ha.quantity, 0) AS pieces
            FROM hunting_activities ha
            WHERE ha.region IS NOT NULL
          ) x
          GROUP BY LOWER(TRIM(region))` as any
    ) as any;

    // Revenu par région (prix permis + taxes)
    const permitRevenueByRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        total: sql<number>`COALESCE(SUM((${permits.price})::numeric), 0)`,
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .groupBy(sql`LOWER(TRIM(${users.region}))`);

    const taxesRevenueByRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        total: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)`,
      })
      .from(taxes)
      .innerJoin(users, eq(taxes.createdBy, users.id))
      .groupBy(sql`LOWER(TRIM(${users.region}))`);

    const infractionsRevenueByRegion: Array<{ region: string; total: number }> = await db.execute(
      sql`SELECT
            LOWER(TRIM(COALESCE(NULLIF(TRIM(l.region), ''), NULLIF(TRIM(u.region), ''), 'national'))) AS region,
            COALESCE(SUM(COALESCE(i.montant_chiffre::numeric, 0)), 0) AS total
          FROM infractions i
          LEFT JOIN lieux l ON l.id = i.lieu_id
          LEFT JOIN users u ON u.id = i.created_by
          GROUP BY 1` as any
    ) as any;

    // Fusionner par région normalisée (sans accents ni casse) pour éviter les doublons type THIES / THIÈS
    const map = new Map<
      string,
      {
        region: string;
        activePermits: number;
        piecesAbattues: number;
        revenue: number;
        permitAmount: number;
        taxAmount: number;
        infractionAmount: number;
      }
    >();
    const getOrInit = (rawRegion: string) => {
      const key = normalizeRegionKey(rawRegion);
      const label = canonicalRegionName(rawRegion);
      return (
        map.get(key) || {
          region: label,
          activePermits: 0,
          piecesAbattues: 0,
          revenue: 0,
          permitAmount: 0,
          taxAmount: 0,
          infractionAmount: 0,
        }
      );
    };

    for (const row of activePermitsByRegion) {
      const key = normalizeRegionKey(row.region);
      const prev = getOrInit(row.region);
      prev.activePermits += Number(row.count || 0);
      map.set(key, prev);
    }
    for (const row of piecesByRegion) {
      const key = normalizeRegionKey(row.region);
      const prev = getOrInit(row.region);
      prev.piecesAbattues += Number(row.pieces || 0);
      map.set(key, prev);
    }
    for (const row of permitRevenueByRegion) {
      const key = normalizeRegionKey(row.region);
      const prev = getOrInit(row.region);
      const pAmt = Number(row.total || 0);
      prev.permitAmount += pAmt;
      prev.revenue += pAmt;
      map.set(key, prev);
    }
    for (const row of taxesRevenueByRegion) {
      const key = normalizeRegionKey(row.region);
      const prev = getOrInit(row.region);
      const tax = Number(row.total || 0);
      prev.revenue += tax;
      prev.taxAmount += tax;
      map.set(key, prev);
    }
    const infraRowsList = Array.isArray(infractionsRevenueByRegion)
      ? infractionsRevenueByRegion
      : (infractionsRevenueByRegion as any)?.rows || [];
    for (const row of infraRowsList) {
      const infraAmt = Number(row.total || 0);
      if (infraAmt <= 0) continue;
      const key = normalizeRegionKey(row.region);
      const prev = getOrInit(row.region);
      prev.infractionAmount += infraAmt;
      map.set(key, prev);
    }

    const data = Array.from(map.values()).filter(r => (r.region || '').length > 0);
    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/by-region:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des agrégats par région' });
  }
});

// GET /api/stats/debug/regions - Diagnostic des données par région (normalisées)
router.get('/debug/regions', isAuthenticated, async (req, res) => {
  try {
    const huntersByRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${hunters.region}))`,
        count: count(),
      })
      .from(hunters)
      .groupBy(sql`LOWER(TRIM(${hunters.region}))`);

    const usersAgentsByRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        count: count(),
      })
      .from(users)
      .where(or(eq(users.role, 'agent'), eq(users.role, 'sub-agent')))
      .groupBy(sql`LOWER(TRIM(${users.region}))`);

    const permitsByIssuerRegionStatus = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        status: permits.status,
        count: count(),
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .groupBy(sql`LOWER(TRIM(${users.region}))`, permits.status);

    const taxesByIssuerRegion = await db
      .select({
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        count: count(),
        amount: sql<number>`COALESCE(SUM((${taxes.amount})::numeric), 0)`,
      })
      .from(taxes)
      .innerJoin(users, eq(taxes.createdBy, users.id))
      .groupBy(sql`LOWER(TRIM(${users.region}))`);

    return res.json({
      huntersByRegion,
      usersAgentsByRegion,
      permitsByIssuerRegionStatus,
      taxesByIssuerRegion,
    });
  } catch (error) {
    console.error('Erreur debug/regions:', error);
    return res.status(500).json({ message: 'Erreur lors du diagnostic des régions' });
  }
});

// GET /api/stats/national/weapons - Statistiques générales des armes
router.get('/national/weapons', isAuthenticated, async (req, res) => {
  try {
    const [
      totalWeapons,
      weaponsByBrand,
      weaponsByCategory,
      weaponsByRegion
    ] = await Promise.all([
      // Total des armes enregistrées (chasseurs avec armes)
      db.select({ count: count() }).from(hunters).where(sql`weapon_type IS NOT NULL`),

      // Armes par marque
      db.select({
        brand: hunters.weaponBrand,
        count: count()
      }).from(hunters)
        .where(sql`weapon_brand IS NOT NULL AND weapon_brand != ''`)
        .groupBy(hunters.weaponBrand)
        .orderBy(desc(count())),

      // Armes par catégorie/type
      db.select({
        category: hunters.weaponType,
        count: count()
      }).from(hunters)
        .where(sql`weapon_type IS NOT NULL`)
        .groupBy(hunters.weaponType)
        .orderBy(desc(count())),

      // Armes par région
      db.select({
        region: sql<string>`LOWER(TRIM(${hunters.region}))`,
        count: count()
      }).from(hunters)
        .where(sql`weapon_type IS NOT NULL AND region IS NOT NULL`)
        .groupBy(sql`LOWER(TRIM(${hunters.region}))`)
        .orderBy(desc(count()))
    ]);

    const data = {
      totalWeapons: totalWeapons[0]?.count || 0,
      weaponsByBrand: (weaponsByBrand || []).map((w: any) => ({
        brand: w.brand || 'Non spécifié',
        count: Number(w.count || 0)
      })),
      weaponsByCategory: (weaponsByCategory || []).map((w: any) => ({
        category: w.category || 'Non spécifié',
        count: Number(w.count || 0)
      })),
      weaponsByRegion: (weaponsByRegion || []).map((w: any) => ({
        region: w.region || 'Non spécifié',
        count: Number(w.count || 0)
      }))
    };

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/weapons:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques d\'armes' });
  }
});

// GET /api/stats/national/permit-expirations - Données d'expiration des permis
router.get('/national/permit-expirations', isAuthenticated, async (req, res) => {
  try {
    const [
      expiring3Months,
      expiring6Months,
      expiring1Year,
      expired
    ] = await Promise.all([
      // Permis expirant dans 3 mois
      db.select({ count: count() }).from(permits)
        .where(sql`expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 months'`),

      // Permis expirant dans 6 mois
      db.select({ count: count() }).from(permits)
        .where(sql`expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months'`),

      // Permis expirant dans 1 an
      db.select({ count: count() }).from(permits)
        .where(sql`expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 year'`),

      // Permis déjà expirés
      db.select({ count: count() }).from(permits)
        .where(sql`expiry_date < CURRENT_DATE`)
    ]);

    const data = {
      expiring3Months: expiring3Months[0]?.count || 0,
      expiring6Months: expiring6Months[0]?.count || 0,
      expiring1Year: expiring1Year[0]?.count || 0,
      expired: expired[0]?.count || 0
    };

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/permit-expirations:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des données d\'expiration des permis' });
  }
});

// GET /api/stats/national/weapons-by-permit-category - Armes par catégorie de permis (avec marque et calibre)
router.get('/national/weapons-by-permit-category', isAuthenticated, async (req, res) => {
  try {
    const data = await db
      .select({
        permitCategory: permits.categoryId,
        weaponType: hunters.weaponType,
        brand: hunters.weaponBrand,
        caliber: hunters.weaponCaliber,
        count: count()
      })
      .from(hunters)
      .innerJoin(permits, eq(hunters.id, permits.hunterId))
      .where(sql`hunters.weapon_type IS NOT NULL AND permits.category_id IS NOT NULL`)
      .groupBy(permits.categoryId, hunters.weaponType, hunters.weaponBrand, hunters.weaponCaliber)
      .orderBy(permits.categoryId, hunters.weaponType, hunters.weaponBrand, hunters.weaponCaliber);

    const merged = new Map<
      string,
      { permitCategory: string; weaponType: string; brand: string; caliber: string; count: number }
    >();
    for (const w of data || []) {
      const permitCategory = String((w as any).permitCategory || 'Non spécifié').trim() || 'Non spécifié';
      const weaponType = String((w as any).weaponType || 'Non spécifié').trim() || 'Non spécifié';
      const brand = String((w as any).brand || 'Non spécifié').trim() || 'Non spécifié';
      const caliber = String((w as any).caliber || 'Non spécifié').trim() || 'Non spécifié';
      const key = `${permitCategory.toLowerCase()}::${weaponType.toLowerCase()}::${brand.toLowerCase()}::${caliber.toLowerCase()}`;
      const prev = merged.get(key) || { permitCategory, weaponType, brand, caliber, count: 0 };
      prev.count += Number((w as any).count || 0);
      merged.set(key, prev);
    }

    return res.json(Array.from(merged.values()));
  } catch (error) {
    console.error('Erreur /api/stats/national/weapons-by-permit-category:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des armes par catégorie de permis' });
  }
});

// GET /api/stats/national/weapons-by-region - Armes par région d'enregistrement (avec marque et calibre)
router.get('/national/weapons-by-region', isAuthenticated, async (req, res) => {
  try {
    const data = await db
      .select({
        region: sql<string>`LOWER(TRIM(${hunters.region}))`,
        brand: hunters.weaponBrand,
        weaponType: hunters.weaponType,
        caliber: hunters.weaponCaliber,
        count: count()
      })
      .from(hunters)
      .where(sql`weapon_type IS NOT NULL AND region IS NOT NULL`)
      .groupBy(sql`LOWER(TRIM(${hunters.region}))`, hunters.weaponBrand, hunters.weaponType, hunters.weaponCaliber)
      .orderBy(sql`LOWER(TRIM(${hunters.region}))`, hunters.weaponBrand, hunters.weaponCaliber);

    const merged = new Map<
      string,
      { region: string; brand: string; weaponType: string; caliber: string; count: number }
    >();
    for (const w of data || []) {
      const regKey = normalizeRegionKey((w as any).region);
      const regLabel = (w as any).region ? canonicalRegionName((w as any).region) : 'Non spécifié';
      const brand = String((w as any).brand || 'Non spécifié').trim() || 'Non spécifié';
      const weaponType = String((w as any).weaponType || 'Non spécifié').trim() || 'Non spécifié';
      const caliber = String((w as any).caliber || 'Non spécifié').trim() || 'Non spécifié';
      const key = `${regKey}::${brand.toLowerCase()}::${weaponType.toLowerCase()}::${caliber.toLowerCase()}`;
      const prev = merged.get(key) || { region: regLabel, brand, weaponType, caliber, count: 0 };
      prev.count += Number((w as any).count || 0);
      merged.set(key, prev);
    }

    return res.json(Array.from(merged.values()));
  } catch (error) {
    console.error('Erreur /api/stats/national/weapons-by-region:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des armes par région' });
  }
});

export default router;
