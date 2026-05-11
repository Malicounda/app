import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { and, count, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { users, hunters, permits, permitRequests, taxes, history } from '../../shared/dist/schema.js';

const router = Router();
const prisma = new PrismaClient();

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
      taxesCount
    ] = await Promise.all([
      db.select({ count: count() }).from(hunters),
      db.select({ count: count() }).from(permits),
      db.select({ count: count() }).from(permits).where(eq(permits.status, 'active')),
      db.select({ count: count() }).from(permitRequests).where(eq(permitRequests.status, 'pending')),
      db.select({ count: count() }).from(users).where(eq(users.role, 'hunting-guide')),
      db.select({ count: count() }).from(users).where(or(eq(users.role, 'agent'), eq(users.role, 'sub-agent'))),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(taxes),
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
    };

    return res.json(stats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
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
  } catch (error) {
    console.error('Erreur /api/stats/national/permit-categories-breakdown:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération de la répartition par catégories' });
  }
});

// GET /api/stats/national/hunters-by-category - Chasseurs par catégorie (national)
router.get('/national/hunters-by-category', isAuthenticated, async (_req, res) => {
  try {
    const data = await db
      .select({ category: hunters.category, count: count() })
      .from(hunters)
      .groupBy(hunters.category);

    return res.json(
      (data || []).map((h: any) => ({
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
        region: sql<string>`LOWER(TRIM(${users.region}))`,
        categoryId: permits.categoryId,
        count: count(),
        avgDurationDays: sql<number>`COALESCE(AVG((DATE_PART('day', ${permits.expiryDate}::timestamp - ${permits.issueDate}::timestamp))), 0)`,
      })
      .from(permits)
      .innerJoin(users, eq(permits.createdBy, users.id))
      .groupBy(sql`LOWER(TRIM(${users.region}))`, permits.categoryId);

    return res.json(
      (rows || []).map((r: any) => ({
        region: r.region || 'non défini',
        categoryId: r.categoryId || 'non défini',
        count: Number(r.count || 0),
        avgDurationDays: Number(r.avgDurationDays || 0),
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
    const rows: Array<{ region: string; species_id: string; nom_espece: string | null; nom_scientifique: string | null; quantity: number }>
      = await db.execute(
        sql`SELECT 
              COALESCE(LOWER(TRIM(u.region)), 'nondefini') AS region,
              d.espece_id AS species_id,
              COALESCE(d.nom_espece, '') AS nom_espece,
              COALESCE(d.nom_scientifique, '') AS nom_scientifique,
              COALESCE(SUM(d.quantity), 0) AS quantity
            FROM declaration_especes d
            LEFT JOIN users u ON u.id = d.user_id
            WHERE COALESCE(d.quantity, 0) > 0
            GROUP BY COALESCE(LOWER(TRIM(u.region)), 'nondefini'), d.espece_id, d.nom_espece, d.nom_scientifique
            ORDER BY region ASC, species_id ASC` as any
      ) as any;

    const data = (rows || []).map(r => ({
      region: r.region || 'non défini',
      speciesId: r.species_id,
      speciesName: r.nom_espece || undefined,
      scientificName: r.nom_scientifique || undefined,
      quantity: Number(r.quantity || 0),
    }));

    return res.json(data);
  } catch (error) {
    console.error('Erreur /api/stats/national/species-by-region:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des pièces abattues par espèce et par région' });
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
      db.select({ count: count() }).from(users).where(or(eq(users.role, 'agent'), eq(users.role, 'sub-agent'))),
      db.select({ count: count() }).from(users).where(eq(users.role, 'hunting-guide')),
      db.select({ count: count() }).from(hunters),
      prisma.alerts.count(),
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
      counts: {
        agents: agentsCountRes[0]?.count || 0,
        guides: guidesCountRes[0]?.count || 0,
        hunters: huntersCountRes[0]?.count || 0,
        alerts: alertsCount || 0,
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
  } catch (error) {
    console.error('Erreur /api/stats/admin/overview:', error);
    return res.status(500).json({ message: "Erreur lors de la récupération des statistiques d'administration" });
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
      pendingRequests,
      permitRevenue,
      taxesAmount,
      taxCount,
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

      // Demandes en attente pour des chasseurs de la région
      db
        .select({ count: count() })
        .from(permitRequests)
        .innerJoin(hunters, eq(permitRequests.hunterId, hunters.id))
        .where(and(eq(permitRequests.status, 'pending'), sql`LOWER(${hunters.region}) = LOWER(${region})`)),

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
    ]);

    const revenue = Number((permitRevenue[0] as any)?.total || 0) + Number((taxesAmount[0] as any)?.total || 0);

    return res.json({
      hunterCount: hunterCount[0]?.count || 0,
      activePermitCount: activePermitCount[0]?.count || 0,
      expiredPermitCount: expiredPermitCount[0]?.count || 0,
      pendingRequests: pendingRequests[0]?.count || 0,
      taxCount: taxCount[0]?.count || 0,
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

    const [permitRevenue, taxesRevenue] = await Promise.all([
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
    ]);

    const data = [
      { name: 'Permis', value: Number((permitRevenue[0] as any)?.total || 0) },
      { name: "Taxes d'abattage", value: Number((taxesRevenue[0] as any)?.total || 0) },
    ];
    return res.json(data);
  } catch (error) {
    console.error('Erreur revenue-by-type:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des revenus par type' });
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
      // Pièces abattues: cumul des déclarations (declaration_especes.quantity) et non des taxes
      db.execute(sql`SELECT COALESCE(SUM(quantity), 0) AS total FROM declaration_especes` as any),
      // Compteur d'infractions (PV) - basé sur la table alerts existante
      prisma.alerts.count(),
    ]);

    const revenue = Number((permitRevenue[0] as any)?.total || 0) + Number((taxesAmount[0] as any)?.total || 0);

    // totalPieces provient d'une requête execute() qui renvoie un tableau de lignes
    const totalPiecesValue = Array.isArray(totalPieces) ? Number((totalPieces[0] as any)?.total || 0) : Number((totalPieces as any)[0]?.total || 0);

    return res.json({
      hunterCount: huntersCount[0]?.count || 0,
      permitCount: permitsCount[0]?.count || 0,
      activePermitCount: activePermitsCount[0]?.count || 0,
      expiredPermitCount: expiredPermitsCount[0]?.count || 0,
      guidesCount: guidesCount[0]?.count || 0,
      taxCount: taxCount[0]?.count || 0,
      revenue,
      totalPiecesAbattues: totalPiecesValue,
      infractionsCount: Number(infractionsCount || 0),
    });
  } catch (error) {
    console.error('Erreur /api/stats/national/aggregates:', error);
    return res.status(500).json({ message: 'Erreur lors de la récupération des agrégats nationaux' });
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

    // Pièces abattues (quantité) par région (émetteur de la déclaration)
    const piecesByRegion: Array<{ region: string; pieces: number }> = await db.execute(
      sql`SELECT LOWER(TRIM(u.region)) AS region, COALESCE(SUM(d.quantity), 0) AS pieces
          FROM declaration_especes d
          INNER JOIN users u ON u.id = d.user_id
          GROUP BY LOWER(TRIM(u.region))` as any
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

    // Fusionner par région
    const map = new Map<string, { region: string; activePermits: number; piecesAbattues: number; revenue: number; taxAmount: number }>();
    for (const row of activePermitsByRegion) {
      map.set(row.region || 'non défini', { region: row.region || 'non défini', activePermits: Number(row.count || 0), piecesAbattues: 0, revenue: 0, taxAmount: 0 });
    }
    for (const row of piecesByRegion) {
      const key = row.region || 'non défini';
      const prev = map.get(key) || { region: key, activePermits: 0, piecesAbattues: 0, revenue: 0, taxAmount: 0 };
      prev.piecesAbattues = Number(row.pieces || 0);
      map.set(key, prev);
    }
    for (const row of permitRevenueByRegion) {
      const key = row.region || 'non défini';
      const prev = map.get(key) || { region: key, activePermits: 0, piecesAbattues: 0, revenue: 0, taxAmount: 0 };
      prev.revenue += Number(row.total || 0);
      map.set(key, prev);
    }
    for (const row of taxesRevenueByRegion) {
      const key = row.region || 'non défini';
      const prev = map.get(key) || { region: key, activePermits: 0, piecesAbattues: 0, revenue: 0, taxAmount: 0 };
      const tax = Number(row.total || 0);
      prev.revenue += tax;
      prev.taxAmount += tax;
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

export default router;
