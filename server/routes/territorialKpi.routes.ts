import { eq, sql } from 'drizzle-orm';
import { Request, Response, Router } from 'express';
import { agents, rolesMetier, users } from '../../shared/schema.js';
import { db } from '../db.js';
import { ensureRolesMetierPilotageColumns } from '../controllers/rolesMetier.controller.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();
router.use(isAuthenticated);

type TerritorialLevel = 'national' | 'regional' | 'departemental' | 'arrondissement';

const LEVEL_LABELS: Record<TerritorialLevel, string> = {
  national: 'National (Tout le Sénégal)',
  regional: 'Régional (IREF)',
  departemental: 'Départemental (Secteur)',
  arrondissement: 'Arrondissement (Sous-Secteur)',
};

const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const asRows = (res: any): any[] =>
  Array.isArray(res) ? res : Array.isArray(res?.rows) ? res.rows : [];

const matchesText = (candidate: unknown, target: string | null | undefined): boolean => {
  if (!target) return true;
  const c = norm(candidate);
  const t = norm(target);
  if (!c || !t) return false;
  return c === t || c.includes(t) || t.includes(c);
};

async function resolveCallerPosture(req: Request) {
  await ensureRolesMetierPilotageColumns();
  const userId = Number((req as any)?.user?.id || (req.session as any)?.user?.id || 0);
  if (!userId) return null;

  const isSuper = await storage.isSuperAdmin(userId);

  const [row] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      role: users.role,
      region: users.region,
      departement: users.departement,
      arrondissement: users.arrondissement,
      commune: users.commune,
      matricule: users.matricule,
      matriculeSol: agents.matriculeSol,
      grade: agents.grade,
      roleMetierCode: rolesMetier.code,
      roleMetierLabel: rolesMetier.labelFr,
      territorialScope: rolesMetier.territorialScope,
      pilotageDomains: rolesMetier.pilotageDomains,
    })
    .from(users)
    .leftJoin(agents, eq(agents.userId as any, users.id as any))
    .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
    .where(eq(users.id as any, userId as any))
    .limit(1);

  if (!row) return null;

  const rawScope = String((row as any).territorialScope || '').toLowerCase();
  const validLevels: TerritorialLevel[] = ['national', 'regional', 'departemental', 'arrondissement'];
  const level: TerritorialLevel | null = validLevels.includes(rawScope as TerritorialLevel)
    ? (rawScope as TerritorialLevel)
    : isSuper
      ? 'national'
      : null;

  const rawDomains = Array.isArray((row as any).pilotageDomains) ? ((row as any).pilotageDomains as string[]) : [];
  const allowedDomains = isSuper
    ? ['ALL']
    : rawDomains.map((d) => String(d).trim().toUpperCase()).filter(Boolean);

  let operationalDomains: string[] = [];
  try {
    const uds = await storage.getUserDomainsByUserId(userId);
    operationalDomains = (Array.isArray(uds) ? uds : [])
      .filter((d: any) => d && d.active !== false && d.domain)
      .map((d: any) => String(d.domain).toUpperCase());
  } catch {
    operationalDomains = [];
  }

  return {
    userId,
    isSuper,
    fullName: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.username,
    grade: row.grade ? String(row.grade).trim() : null,
    matricule: (row.matricule || row.matriculeSol) ? String(row.matricule || row.matriculeSol).trim() : null,
    roleMetierCode: row.roleMetierCode || null,
    roleMetierLabel: row.roleMetierLabel || (isSuper ? 'Super Administrateur' : null),
    level,
    allowedDomains,
    region: row.region ? String(row.region).trim() : null,
    departement: row.departement ? String(row.departement).trim() : null,
    arrondissement: row.arrondissement ? String(row.arrondissement).trim() : null,
    commune: row.commune ? String(row.commune).trim() : null,
    operationalDomains: Array.from(new Set(operationalDomains)),
  };
}

const normalizeDomainKey = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

const matchBuiltInDomain = (v: unknown): 'CHASSE' | 'REBOISEMENT' | 'ALERTE' | null => {
  const k = normalizeDomainKey(v);
  if (!k) return null;
  if (k.includes('CHASSE') || k.includes('FAUNE')) return 'CHASSE';
  if (k.includes('REBOISEMENT') || k.includes('PEPINI') || k.includes('REFOREST')) return 'REBOISEMENT';
  if (k.includes('ALERTE')) return 'ALERTE';
  return null;
};

function canSeeDomain(allowedDomains: string[], target: 'CHASSE' | 'REBOISEMENT' | 'ALERTE'): boolean {
  if (allowedDomains.includes('ALL')) return true;
  return allowedDomains.some((d) => matchBuiltInDomain(d) === target);
}

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const posture = await resolveCallerPosture(req);
    if (!posture) {
      return res.status(401).json({ ok: false, message: 'Non authentifié' });
    }
    if (!posture.level) {
      return res.status(403).json({
        ok: false,
        message: "Votre rôle métier ne dispose pas d'une portée de pilotage territorial KPI.",
      });
    }

    // Sous-filtre optionnel uniquement à l'intérieur du périmètre autorisé
    const subFilter = typeof req.query.subZone === 'string' && req.query.subZone.trim() && req.query.subZone !== 'ALL'
      ? req.query.subZone.trim()
      : null;

    // Fonction de filtrage territorial stricte selon le niveau du cadre
    const inTerritorialScope = (record: {
      region?: string | null;
      departement?: string | null;
      arrondissement?: string | null;
      commune?: string | null;
    }): boolean => {
      if (posture.level === 'national') {
        return subFilter ? matchesText(record.region, subFilter) : true;
      }
      if (posture.level === 'regional') {
        if (!matchesText(record.region, posture.region)) return false;
        return subFilter ? matchesText(record.departement, subFilter) : true;
      }
      if (posture.level === 'departemental') {
        if (posture.departement && !matchesText(record.departement, posture.departement)) return false;
        if (!posture.departement && posture.region && !matchesText(record.region, posture.region)) return false;
        return subFilter ? (matchesText(record.arrondissement, subFilter) || matchesText(record.commune, subFilter)) : true;
      }
      // arrondissement (Sous-Secteur)
      if (posture.arrondissement) {
        if (!matchesText(record.arrondissement, posture.arrondissement)) return false;
      } else if (posture.departement) {
        if (!matchesText(record.departement, posture.departement)) return false;
      } else if (posture.region) {
        if (!matchesText(record.region, posture.region)) return false;
      }
      return subFilter ? matchesText(record.commune, subFilter) : true;
    };

    const getSubZoneKey = (record: {
      region?: string | null;
      departement?: string | null;
      arrondissement?: string | null;
      commune?: string | null;
    }): string => {
      if (posture.level === 'national') return String(record.region || 'Non renseignée').trim() || 'Non renseignée';
      if (posture.level === 'regional') return String(record.departement || 'Non renseigné').trim() || 'Non renseigné';
      if (posture.level === 'departemental') {
        return String(record.arrondissement || record.commune || 'Non renseigné').trim() || 'Non renseigné';
      }
      return String(record.commune || record.arrondissement || 'Non renseignée').trim() || 'Non renseignée';
    };

    const subZoneHeading =
      posture.level === 'national'
        ? 'Région'
        : posture.level === 'regional'
          ? 'Département'
          : posture.level === 'departemental'
            ? 'Arrondissement / Commune'
            : 'Commune';

    const territoryDisplay =
      posture.level === 'national'
        ? 'Sénégal (National)'
        : posture.level === 'regional'
          ? `Région de ${posture.region || '—'}`
          : posture.level === 'departemental'
            ? `Département de ${posture.departement || '—'}${posture.region ? ` (${posture.region})` : ''}`
            : `Arrondissement de ${posture.arrondissement || '—'}${posture.departement ? ` (${posture.departement})` : ''}`;

    // Charger STRICTEMENT les domaines ajoutés et actifs dans la page Domaines
    let allDbDomains: Array<{ nomDomaine?: string | null; codeSlug?: string | null; isActive?: boolean | null }> = [];
    try {
      const domRes = await db.execute(sql`
        SELECT
          nom_domaine AS "nomDomaine",
          code_slug AS "codeSlug",
          COALESCE(is_active, true) AS "isActive"
        FROM domaines
        WHERE COALESCE(is_active, true) = true
      `);
      allDbDomains = asRows(domRes);
    } catch {
      try {
        const fetched = await storage.getAllDomains();
        allDbDomains = Array.isArray(fetched) ? fetched : [];
      } catch {
        allDbDomains = [];
      }
    }

    const isDomainAddedAndActive = (target: 'CHASSE' | 'REBOISEMENT' | 'ALERTE'): boolean => {
      return allDbDomains.some(
        (d) =>
          d &&
          d.isActive !== false &&
          (matchBuiltInDomain(d.codeSlug) === target || matchBuiltInDomain(d.nomDomaine) === target)
      );
    };

    const showChasse = canSeeDomain(posture.allowedDomains, 'CHASSE') && isDomainAddedAndActive('CHASSE');
    const showReboisement = canSeeDomain(posture.allowedDomains, 'REBOISEMENT') && isDomainAddedAndActive('REBOISEMENT');
    const showAlerte = canSeeDomain(posture.allowedDomains, 'ALERTE') && isDomainAddedAndActive('ALERTE');

    const subZonesSet = new Set<string>();

    // ── 1. KPI CHASSE ──────────────────────────────────────────────────────────
    let chasseKpi: any = null;
    if (showChasse) {
      const [
        huntersRes,
        permitsRes,
        requestsRes,
        guidesRes,
        taxesRes,
        infractionsRes,
        zonesRes,
        speciesRes,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            h.id,
            h.category,
            h.weapon_type AS "weaponType",
            h.weapon_brand AS "weaponBrand",
            h.weapon_caliber AS "weaponCaliber",
            h.weapon_reference AS "weaponReference",
            COALESCE(NULLIF(TRIM(h.region), ''), NULLIF(TRIM(u_h.region), ''), NULLIF(TRIM(u_c.region), '')) AS region,
            COALESCE(NULLIF(TRIM(h.departement), ''), NULLIF(TRIM(u_h.departement), ''), NULLIF(TRIM(u_c.departement), '')) AS departement,
            COALESCE(NULLIF(TRIM(u_h.arrondissement), ''), NULLIF(TRIM(u_c.arrondissement), '')) AS arrondissement,
            COALESCE(NULLIF(TRIM(u_h.commune), ''), NULLIF(TRIM(u_c.commune), '')) AS commune
          FROM hunters h
          LEFT JOIN users u_h ON u_h.hunter_id = h.id
          LEFT JOIN users u_c ON u_c.id = h.created_by_user_id
          WHERE COALESCE(h.is_active, true) = true
        `),
        db.execute(sql`
          SELECT
            p.id,
            p.status,
            p.price,
            p.type,
            p.category_id AS "categoryId",
            p.expiry_date AS "expiryDate",
            pc.label_fr AS "categoryLabel",
            pc.groupe AS "categoryGroupe",
            pc.genre AS "categoryGenre",
            COALESCE(NULLIF(TRIM(u_c.region), ''), NULLIF(TRIM(h.region), ''), NULLIF(TRIM(u_h.region), '')) AS region,
            COALESCE(NULLIF(TRIM(u_c.departement), ''), NULLIF(TRIM(h.departement), ''), NULLIF(TRIM(u_h.departement), '')) AS departement,
            COALESCE(NULLIF(TRIM(u_c.arrondissement), ''), NULLIF(TRIM(u_h.arrondissement), '')) AS arrondissement,
            COALESCE(NULLIF(TRIM(u_c.commune), ''), NULLIF(TRIM(u_h.commune), '')) AS commune
          FROM permits p
          LEFT JOIN permit_categories pc ON pc.key = p.category_id
          LEFT JOIN hunters h ON h.id = p.hunter_id
          LEFT JOIN users u_h ON u_h.hunter_id = h.id
          LEFT JOIN users u_c ON u_c.id = p.created_by
        `),
        db.execute(sql`
          SELECT
            pr.id,
            pr.status,
            COALESCE(NULLIF(TRIM(pr.region), ''), NULLIF(TRIM(h.region), ''), NULLIF(TRIM(u.region), '')) AS region,
            COALESCE(NULLIF(TRIM(h.departement), ''), NULLIF(TRIM(u.departement), '')) AS departement,
            NULLIF(TRIM(u.arrondissement), '') AS arrondissement,
            NULLIF(TRIM(u.commune), '') AS commune
          FROM permit_requests pr
          LEFT JOIN hunters h ON h.id = pr.hunter_id
          LEFT JOIN users u ON u.id = pr.user_id
        `),
        db.execute(sql`
          SELECT
            g.id,
            g.zone_id AS "zoneId",
            COALESCE(NULLIF(TRIM(g.region), ''), NULLIF(TRIM(u.region), '')) AS region,
            COALESCE(NULLIF(TRIM(g.departement), ''), NULLIF(TRIM(u.departement), '')) AS departement,
            NULLIF(TRIM(u.arrondissement), '') AS arrondissement,
            NULLIF(TRIM(u.commune), '') AS commune
          FROM hunting_guides g
          LEFT JOIN users u ON u.id = g.user_id
          WHERE COALESCE(g.is_active, true) = true
        `),
        db.execute(sql`
          SELECT
            t.id,
            t.amount,
            t.quantity,
            t.animal_type AS "animalType",
            COALESCE(NULLIF(TRIM(u_c.region), ''), NULLIF(TRIM(t.external_hunter_region), ''), NULLIF(TRIM(h.region), '')) AS region,
            COALESCE(NULLIF(TRIM(u_c.departement), ''), NULLIF(TRIM(h.departement), '')) AS departement,
            NULLIF(TRIM(u_c.arrondissement), '') AS arrondissement,
            NULLIF(TRIM(u_c.commune), '') AS commune
          FROM taxes t
          LEFT JOIN hunters h ON h.id = t.hunter_id
          LEFT JOIN users u_c ON u_c.id = t.created_by
        `),
        db.execute(sql`
          SELECT
            i.id,
            i.montant_chiffre AS "montantChiffre",
            COALESCE(NULLIF(TRIM(l.region), ''), NULLIF(TRIM(u.region), '')) AS region,
            COALESCE(NULLIF(TRIM(l.departement), ''), NULLIF(TRIM(u.departement), '')) AS departement,
            COALESCE(NULLIF(TRIM(l.arrondissement), ''), NULLIF(TRIM(u.arrondissement), '')) AS arrondissement,
            COALESCE(NULLIF(TRIM(l.commune), ''), NULLIF(TRIM(u.commune), '')) AS commune
          FROM infractions i
          LEFT JOIN lieux l ON l.id = i.lieu_id
          LEFT JOIN users u ON u.id = COALESCE(i.agent_id, i.created_by)
        `).catch(() =>
          db.execute(sql`
            SELECT
              i.id,
              i.montant_chiffre AS "montantChiffre",
              NULLIF(TRIM(u.region), '') AS region,
              NULLIF(TRIM(u.departement), '') AS departement,
              NULLIF(TRIM(u.arrondissement), '') AS arrondissement,
              NULLIF(TRIM(u.commune), '') AS commune
            FROM infractions i
            LEFT JOIN users u ON u.id = COALESCE(i.agent_id, i.created_by)
          `)
        ),
        db.execute(sql`
          SELECT
            z.id,
            z.name,
            z.type,
            z.status,
            z.responsible_name AS "responsibleName",
            z.responsible_phone AS "responsiblePhone",
            COALESCE(z.guides_count, 0) AS "guidesCount",
            COALESCE(z.trackers_count, 0) AS "trackersCount",
            COALESCE(zg.linked_guides, 0) AS "linkedGuides",
            z.region,
            z.departement,
            z.arrondissement,
            z.commune,
            COALESCE(
              CASE WHEN z.geometry IS NOT NULL THEN ST_Area(Geography(z.geometry)) / 10000.0 ELSE NULL END,
              z.area_sq_km * 100.0,
              0
            ) AS "surfaceHa"
          FROM zones z
          LEFT JOIN (
            SELECT zone_id, COUNT(DISTINCT guide_id) AS linked_guides
            FROM zone_guides
            GROUP BY zone_id
          ) zg ON zg.zone_id = z.id
          ORDER BY z.name ASC
        `).catch(() =>
          db.execute(sql`
            SELECT
              id, name, type, status,
              responsible_name AS "responsibleName",
              responsible_phone AS "responsiblePhone",
              COALESCE(guides_count, 0) AS "guidesCount",
              COALESCE(trackers_count, 0) AS "trackersCount",
              0 AS "linkedGuides",
              region, departement, arrondissement, commune,
              COALESCE(area_sq_km * 100.0, 0) AS "surfaceHa"
            FROM zones
            ORDER BY name ASC
          `).catch(() => [])
        ),
        db.execute(sql`
          SELECT
            COALESCE(NULLIF(TRIM(e.nom), ''), NULLIF(TRIM(x.nom_espece), ''), NULLIF(TRIM(x.species_id), ''), 'Autre espèce') AS "speciesName",
            COALESCE(NULLIF(TRIM(e.nom_scientifique), ''), NULLIF(TRIM(x.nom_scientifique), ''), '') AS "scientificName",
            COALESCE(NULLIF(TRIM(e.groupe), ''), NULLIF(TRIM(x.category), ''), 'Autre') AS category,
            COALESCE(x.quantity, 0) AS quantity,
            x.region,
            x.departement,
            x.arrondissement,
            x.commune
          FROM (
            SELECT
              COALESCE(NULLIF(TRIM(d.region), ''), NULLIF(TRIM(u.region), ''), NULLIF(TRIM(h_d.region), '')) AS region,
              COALESCE(NULLIF(TRIM(d.departement), ''), NULLIF(TRIM(u.departement), ''), NULLIF(TRIM(h_d.departement), '')) AS departement,
              COALESCE(NULLIF(TRIM(d.arrondissement), ''), NULLIF(TRIM(u.arrondissement), '')) AS arrondissement,
              COALESCE(NULLIF(TRIM(d.commune), ''), NULLIF(TRIM(u.commune), '')) AS commune,
              d.espece_id AS species_id,
              d.nom_espece,
              d.nom_scientifique,
              d.quantity,
              d.category
            FROM declaration_especes d
            LEFT JOIN users u ON u.id = d.user_id
            LEFT JOIN hunters h_d ON h_d.id = d.hunter_id
            WHERE (d.status IS NULL OR d.status = 'pending')

            UNION ALL

            SELECT
              COALESCE(NULLIF(TRIM(ha.region), ''), NULLIF(TRIM(d_src.region), ''), NULLIF(TRIM(u_src.region), ''), NULLIF(TRIM(h_ha.region), '')) AS region,
              COALESCE(NULLIF(TRIM(d_src.departement), ''), NULLIF(TRIM(u_src.departement), ''), NULLIF(TRIM(h_ha.departement), '')) AS departement,
              COALESCE(NULLIF(TRIM(d_src.arrondissement), ''), NULLIF(TRIM(u_src.arrondissement), '')) AS arrondissement,
              COALESCE(NULLIF(TRIM(d_src.commune), ''), NULLIF(TRIM(u_src.commune), '')) AS commune,
              ha.species_id,
              ha.species_name AS nom_espece,
              ha.scientific_name AS nom_scientifique,
              ha.quantity,
              d_src.category
            FROM hunting_activities ha
            LEFT JOIN declaration_especes d_src ON ha.source_id = d_src.id
            LEFT JOIN users u_src ON u_src.id = d_src.user_id
            LEFT JOIN hunters h_ha ON h_ha.id = ha.hunter_id
          ) x
          LEFT JOIN especes e ON (e.id::text = x.species_id::text OR LOWER(TRIM(e.nom)) = LOWER(TRIM(x.nom_espece)))
          WHERE COALESCE(x.quantity, 0) > 0
        `).catch(() => []),
      ]);

      const hunterRows = asRows(huntersRes);
      const permitRows = asRows(permitsRes);
      const requestRows = asRows(requestsRes);
      const guideRows = asRows(guidesRes);
      const taxRows = asRows(taxesRes);
      const infractionRows = asRows(infractionsRes);
      const zoneRows = asRows(zonesRes);
      const speciesRows = asRows(speciesRes);

      // Collecter toutes les sous-zones disponibles dans le périmètre (avant subFilter)
      const collectZones = (rows: any[]) => {
        for (const r of rows) {
          const inParent =
            posture.level === 'national'
              ? true
              : posture.level === 'regional'
                ? matchesText(r.region, posture.region)
                : posture.level === 'departemental'
                  ? (posture.departement ? matchesText(r.departement, posture.departement) : matchesText(r.region, posture.region))
                  : (posture.arrondissement ? matchesText(r.arrondissement, posture.arrondissement) : matchesText(r.departement, posture.departement));
          if (inParent) {
            const z = getSubZoneKey(r);
            if (z && z !== 'Non renseignée' && z !== 'Non renseigné') subZonesSet.add(z);
          }
        }
      };
      collectZones(hunterRows);
      collectZones(permitRows);
      collectZones(zoneRows);

      const scopedHunters = hunterRows.filter(inTerritorialScope);
      const scopedPermits = permitRows.filter(inTerritorialScope);
      const scopedRequests = requestRows.filter(inTerritorialScope);
      const scopedGuides = guideRows.filter(inTerritorialScope);
      const scopedTaxes = taxRows.filter(inTerritorialScope);
      const scopedInfractions = infractionRows.filter(inTerritorialScope);
      const scopedZones = zoneRows.filter(inTerritorialScope);
      const scopedSpecies = speciesRows.filter(inTerritorialScope);

      const now = new Date();
      let activePermits = 0;
      let expiredPermits = 0;
      let permitsRevenue = 0;
      const categoryMap = new Map<string, { category: string; count: number; revenue: number }>();

      const revenuesBreakdown = {
        petiteChasse: 0,
        gibierEau: 0,
        grandeChasse: 0,
        taxeAmodiation: 0,
        licencesGuides: 0,
        attestationsPisteurs: 0,
        taxeReservePrivee: 0,
        taxesAbattage: 0,
        contentieux: 0,
      };

      const breakdownMap = new Map<
        string,
        {
          zone: string;
          hunters: number;
          guides: number;
          activePermits: number;
          pendingRequests: number;
          permitsRevenue: number;
          taxesRevenue: number;
          infractions: number;
          piecesAbattues: number;
          weaponsCount: number;
        }
      >();
      const ensureZone = (z: string) => {
        let entry = breakdownMap.get(z);
        if (!entry) {
          entry = {
            zone: z,
            hunters: 0,
            guides: 0,
            activePermits: 0,
            pendingRequests: 0,
            permitsRevenue: 0,
            taxesRevenue: 0,
            infractions: 0,
            piecesAbattues: 0,
            weaponsCount: 0,
          };
          breakdownMap.set(z, entry);
        }
        return entry;
      };

      // Armes à feu enregistrées & catégories de chasseurs
      let totalWeapons = 0;
      const weaponTypeMap = new Map<string, number>();
      const weaponCaliberMap = new Map<string, number>();
      const weaponBrandMap = new Map<string, number>();
      const weaponDetailMap = new Map<string, { weaponType: string; brand: string; caliber: string; count: number }>();
      const hunterCatMap = new Map<string, number>();

      for (const h of scopedHunters) {
        const zEntry = ensureZone(getSubZoneKey(h));
        zEntry.hunters++;

        const hCat = String(h.category || 'Non défini').trim() || 'Non défini';
        hunterCatMap.set(hCat, (hunterCatMap.get(hCat) || 0) + 1);

        const wType = String(h.weaponType || '').trim();
        if (wType) {
          totalWeapons++;
          zEntry.weaponsCount++;
          const wBrand = String(h.weaponBrand || 'Non spécifiée').trim() || 'Non spécifiée';
          const wCal = String(h.weaponCaliber || 'Non spécifié').trim() || 'Non spécifié';
          weaponTypeMap.set(wType, (weaponTypeMap.get(wType) || 0) + 1);
          weaponCaliberMap.set(wCal, (weaponCaliberMap.get(wCal) || 0) + 1);
          weaponBrandMap.set(wBrand, (weaponBrandMap.get(wBrand) || 0) + 1);
          const dk = `${norm(wType)}::${norm(wBrand)}::${norm(wCal)}`;
          const prev = weaponDetailMap.get(dk) || { weaponType: wType, brand: wBrand, caliber: wCal, count: 0 };
          prev.count++;
          weaponDetailMap.set(dk, prev);
        }
      }

      for (const g of scopedGuides) {
        ensureZone(getSubZoneKey(g)).guides++;
      }

      for (const p of scopedPermits) {
        const price = Number(p.price) || 0;
        permitsRevenue += price;
        const expiry = p.expiryDate ? new Date(p.expiryDate) : null;
        const isExpired = p.status === 'expired' || (expiry && !Number.isNaN(expiry.getTime()) && expiry < now);
        const isActive = p.status === 'active' && !isExpired;
        if (isActive) activePermits++;
        else if (isExpired) expiredPermits++;

        const catLabel = String(p.categoryLabel || p.type || p.categoryId || 'Autre').trim() || 'Autre';
        const cat = categoryMap.get(catLabel) || { category: catLabel, count: 0, revenue: 0 };
        cat.count++;
        cat.revenue += price;
        categoryMap.set(catLabel, cat);

        // Ventilation financière (Petite chasse / Gibier d'eau / Grande chasse / Amodiation & Licences)
        const combined = norm(`${p.categoryId || ''} ${p.type || ''} ${p.categoryGroupe || ''} ${p.categoryLabel || ''}`);
        if (combined.includes('amodiation')) {
          revenuesBreakdown.taxeAmodiation += price;
        } else if (combined.includes('pisteur')) {
          revenuesBreakdown.attestationsPisteurs += price;
        } else if (combined.includes('reserve')) {
          revenuesBreakdown.taxeReservePrivee += price;
        } else if (combined.includes('licence') || combined.includes('guide')) {
          revenuesBreakdown.licencesGuides += price;
        } else if (combined.includes('eau') || combined.includes('waterfowl')) {
          revenuesBreakdown.gibierEau += price;
        } else if (combined.includes('grande')) {
          revenuesBreakdown.grandeChasse += price;
        } else {
          revenuesBreakdown.petiteChasse += price;
        }

        const zEntry = ensureZone(getSubZoneKey(p));
        if (isActive) zEntry.activePermits++;
        zEntry.permitsRevenue += price;
      }

      let pendingRequests = 0;
      let approvedRequests = 0;
      let rejectedRequests = 0;
      for (const pr of scopedRequests) {
        const st = String(pr.status || '').toLowerCase();
        if (st === 'pending') {
          pendingRequests++;
          ensureZone(getSubZoneKey(pr)).pendingRequests++;
        } else if (st === 'approved') approvedRequests++;
        else if (st === 'rejected') rejectedRequests++;
      }

      let taxesRevenue = 0;
      for (const t of scopedTaxes) {
        const amt = Number(t.amount) || 0;
        taxesRevenue += amt;
        ensureZone(getSubZoneKey(t)).taxesRevenue += amt;

        const animalNorm = norm(t.animalType || '');
        if (animalNorm.includes('amodiation')) {
          revenuesBreakdown.taxeAmodiation += amt;
        } else if (animalNorm.includes('licence')) {
          revenuesBreakdown.licencesGuides += amt;
        } else if (animalNorm.includes('pisteur')) {
          revenuesBreakdown.attestationsPisteurs += amt;
        } else if (animalNorm.includes('reserve')) {
          revenuesBreakdown.taxeReservePrivee += amt;
        } else {
          revenuesBreakdown.taxesAbattage += amt;
        }
      }

      let infractionsAmount = 0;
      for (const inf of scopedInfractions) {
        const amt = Number(inf.montantChiffre) || 0;
        infractionsAmount += amt;
        revenuesBreakdown.contentieux += amt;
        ensureZone(getSubZoneKey(inf)).infractions++;
      }

      // Zones amodiées & ZIC (superficie, guides, pisteurs par établissement)
      const zonesAmodiees: Array<{
        id: number;
        name: string;
        status: string;
        region: string;
        departement: string;
        arrondissement: string;
        commune: string;
        responsibleName: string;
        responsiblePhone: string;
        surfaceHa: number;
        guidesCount: number;
        trackersCount: number;
      }> = [];
      let amodieesSurfaceHa = 0;
      let zicsCount = 0;
      let totalPisteurs = 0;
      let totalZoneGuides = 0;

      for (const z of scopedZones) {
        const zType = norm(z.type || '');
        const surfaceHa = Math.round((Number(z.surfaceHa) || 0) * 100) / 100;
        if (zType.includes('zic')) {
          zicsCount++;
        }
        if (zType.includes('amodi')) {
          const gCount = Math.max(Number(z.guidesCount) || 0, Number(z.linkedGuides) || 0);
          const tCount = Number(z.trackersCount) || 0;
          amodieesSurfaceHa += surfaceHa;
          totalZoneGuides += gCount;
          totalPisteurs += tCount;
          zonesAmodiees.push({
            id: Number(z.id),
            name: String(z.name || 'Zone amodiée').trim(),
            status: String(z.status || 'active').trim(),
            region: String(z.region || '').trim(),
            departement: String(z.departement || '').trim(),
            arrondissement: String(z.arrondissement || '').trim(),
            commune: String(z.commune || '').trim(),
            responsibleName: String(z.responsibleName || '').trim(),
            responsiblePhone: String(z.responsiblePhone || '').trim(),
            surfaceHa,
            guidesCount: gCount,
            trackersCount: tCount,
          });
        }
      }

      // Espèces abattues (prélèvements)
      let totalPiecesAbattues = 0;
      const speciesMap = new Map<string, { speciesName: string; scientificName: string; category: string; quantity: number }>();
      for (const sp of scopedSpecies) {
        const qty = Number(sp.quantity) || 0;
        if (qty <= 0) continue;
        totalPiecesAbattues += qty;
        ensureZone(getSubZoneKey(sp)).piecesAbattues += qty;
        const sName = String(sp.speciesName || 'Autre espèce').trim();
        const key = norm(sName);
        const prev = speciesMap.get(key) || {
          speciesName: sName,
          scientificName: String(sp.scientificName || '').trim(),
          category: String(sp.category || 'Autre').trim(),
          quantity: 0,
        };
        prev.quantity += qty;
        speciesMap.set(key, prev);
      }

      const totalAmodieesRevenue =
        revenuesBreakdown.taxeAmodiation +
        revenuesBreakdown.licencesGuides +
        revenuesBreakdown.attestationsPisteurs +
        revenuesBreakdown.taxeReservePrivee;

      chasseKpi = {
        totalHunters: scopedHunters.length,
        totalGuides: Math.max(scopedGuides.length, totalZoneGuides),
        totalPisteurs,
        totalPermits: scopedPermits.length,
        activePermits,
        expiredPermits,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        permitsRevenue,
        taxesCount: scopedTaxes.length,
        taxesRevenue,
        totalRevenue: permitsRevenue + taxesRevenue,
        infractionsCount: scopedInfractions.length,
        infractionsAmount,
        amodieesCount: zonesAmodiees.length,
        amodieesSurfaceHa: Math.round(amodieesSurfaceHa),
        zicsCount,
        zonesAmodiees,
        amodieesFinance: {
          taxeAmodiation: revenuesBreakdown.taxeAmodiation,
          licencesGuides: revenuesBreakdown.licencesGuides,
          attestationsPisteurs: revenuesBreakdown.attestationsPisteurs,
          taxeReservePrivee: revenuesBreakdown.taxeReservePrivee,
          totalAmodieesRevenue,
        },
        revenuesBreakdown,
        totalPiecesAbattues,
        speciesBreakdown: Array.from(speciesMap.values()).sort((a, b) => b.quantity - a.quantity),
        weapons: {
          totalWeapons,
          byType: Array.from(weaponTypeMap.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
          byCaliber: Array.from(weaponCaliberMap.entries())
            .map(([caliber, count]) => ({ caliber, count }))
            .sort((a, b) => b.count - a.count),
          byBrand: Array.from(weaponBrandMap.entries())
            .map(([brand, count]) => ({ brand, count }))
            .sort((a, b) => b.count - a.count),
          details: Array.from(weaponDetailMap.values()).sort((a, b) => b.count - a.count),
        },
        huntersByCategory: Array.from(hunterCatMap.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        permitsByCategory: Array.from(categoryMap.values()).sort((a, b) => b.count - a.count),
        breakdownBySubZone: Array.from(breakdownMap.values()).sort(
          (a, b) => b.activePermits + b.hunters - (a.activePermits + a.hunters)
        ),
      };
    }

    // ── 2. KPI REBOISEMENT ─────────────────────────────────────────────────────
    let reboisementKpi: any = null;
    if (showReboisement) {
      try {
        const reportsRes = await db.execute(sql`
          SELECT id, status, region, departement, arrondissement, commune, period, report_date AS "reportDate"
          FROM reforestation_reports
        `);
        const allReports = asRows(reportsRes);
        const scopedReports = allReports.filter(inTerritorialScope);

        let validatedReports = 0;
        let submittedReports = 0;
        let draftReports = 0;
        const zoneMap = new Map<string, { zone: string; total: number; validated: number; submitted: number }>();

        for (const r of scopedReports) {
          const st = String(r.status || '').toLowerCase();
          if (st === 'valide' || st === 'validé' || st === 'validated') validatedReports++;
          else if (st === 'soumis' || st === 'submitted') submittedReports++;
          else draftReports++;

          const z = getSubZoneKey(r);
          if (z && z !== 'Non renseignée' && z !== 'Non renseigné') subZonesSet.add(z);
          const entry = zoneMap.get(z) || { zone: z, total: 0, validated: 0, submitted: 0 };
          entry.total++;
          if (st === 'valide' || st === 'validé' || st === 'validated') entry.validated++;
          if (st === 'soumis' || st === 'submitted') entry.submitted++;
          zoneMap.set(z, entry);
        }

        // Totaux plants produits / plantés si des rapports existent dans la portée
        let totalPlantsProduced = 0;
        let totalPlantsPlanted = 0;
        const reportIds = scopedReports.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
        if (reportIds.length > 0) {
          try {
            const idList = sql.join(reportIds.map((id) => sql`${id}`), sql`, `);
            const prodRes = await db.execute(sql`
              SELECT COALESCE(SUM(COALESCE(quantite_produite, 0)), 0) AS total
              FROM reforestation_production_data
              WHERE report_id IN (${idList})
            `);
            totalPlantsProduced = Number(asRows(prodRes)[0]?.total) || 0;
          } catch {}
          try {
            const idList = sql.join(reportIds.map((id) => sql`${id}`), sql`, `);
            const plantRes = await db.execute(sql`
              SELECT COALESCE(SUM(COALESCE(nombre_plants, 0)), 0) AS total
              FROM reforestation_plants_data
              WHERE report_id IN (${idList})
            `);
            totalPlantsPlanted = Number(asRows(plantRes)[0]?.total) || 0;
          } catch {}
        }

        reboisementKpi = {
          totalReports: scopedReports.length,
          validatedReports,
          submittedReports,
          draftReports,
          totalPlantsProduced,
          totalPlantsPlanted,
          breakdownBySubZone: Array.from(zoneMap.values()).sort((a, b) => b.total - a.total),
        };
      } catch (e) {
        console.warn('[territorial-kpi] reboisement fallback:', e);
        reboisementKpi = {
          totalReports: 0,
          validatedReports: 0,
          submittedReports: 0,
          draftReports: 0,
          totalPlantsProduced: 0,
          totalPlantsPlanted: 0,
          breakdownBySubZone: [],
        };
      }
    }

    // ── 3. KPI ALERTES ─────────────────────────────────────────────────────────
    let alerteKpi: any = null;
    if (showAlerte) {
      try {
        const alertsRes = await db.execute(sql`
          SELECT
            id, title, nature, region, departement, arrondissement, commune,
            is_read AS "isRead", created_at AS "createdAt"
          FROM alerts
          ORDER BY created_at DESC
        `);
        const allAlerts = asRows(alertsRes);
        const scopedAlerts = allAlerts.filter(inTerritorialScope);

        let unreadAlerts = 0;
        const natureMap = new Map<string, number>();
        const zoneMap = new Map<string, { zone: string; total: number; unread: number }>();

        for (const a of scopedAlerts) {
          if (!a.isRead) unreadAlerts++;
          const nat = String(a.nature || 'autre').trim() || 'autre';
          natureMap.set(nat, (natureMap.get(nat) || 0) + 1);

          const z = getSubZoneKey(a);
          if (z && z !== 'Non renseignée' && z !== 'Non renseigné') subZonesSet.add(z);
          const entry = zoneMap.get(z) || { zone: z, total: 0, unread: 0 };
          entry.total++;
          if (!a.isRead) entry.unread++;
          zoneMap.set(z, entry);
        }

        alerteKpi = {
          totalAlerts: scopedAlerts.length,
          unreadAlerts,
          readAlerts: scopedAlerts.length - unreadAlerts,
          byNature: Array.from(natureMap.entries())
            .map(([nature, count]) => ({ nature, count }))
            .sort((a, b) => b.count - a.count),
          recentAlerts: scopedAlerts.slice(0, 8),
          breakdownBySubZone: Array.from(zoneMap.values()).sort((a, b) => b.total - a.total),
        };
      } catch (e) {
        console.warn('[territorial-kpi] alerts fallback:', e);
        alerteKpi = {
          totalAlerts: 0,
          unreadAlerts: 0,
          readAlerts: 0,
          byNature: [],
          recentAlerts: [],
          breakdownBySubZone: [],
        };
      }
    }

    // ── 4. AUTRES DOMAINES DYNAMIQUES (créés depuis la page Domaines) ──────────
    let extraDomains: Array<{ codeSlug: string; nomDomaine: string; agentsCount: number }> = [];
    try {
      const candidates = allDbDomains.filter((d: any) => {
        if (!d || d.isActive === false || (!d.codeSlug && !d.nomDomaine)) return false;
        if (matchBuiltInDomain(d.codeSlug) !== null || matchBuiltInDomain(d.nomDomaine) !== null) return false;
        const slug = normalizeDomainKey(d.codeSlug || d.nomDomaine);
        const nom = normalizeDomainKey(d.nomDomaine || d.codeSlug);
        return (
          posture.allowedDomains.includes('ALL') ||
          posture.allowedDomains.some((a) => {
            const na = normalizeDomainKey(a);
            return na === slug || na === nom;
          })
        );
      });

      if (candidates.length > 0) {
        const udRes = await db.execute(sql`
          SELECT
            UPPER(TRIM(COALESCE(ud.domain, d.code_slug, ''))) AS "domainSlug",
            NULLIF(TRIM(u.region), '') AS region,
            NULLIF(TRIM(u.departement), '') AS departement,
            NULLIF(TRIM(u.arrondissement), '') AS arrondissement,
            NULLIF(TRIM(u.commune), '') AS commune
          FROM user_domains ud
          LEFT JOIN domaines d ON d.id = ud.domaine_id
          INNER JOIN users u ON u.id = ud.user_id
          WHERE COALESCE(ud.active, true) = true
        `);
        const udRows = asRows(udRes).filter(inTerritorialScope);
        extraDomains = candidates.map((d: any) => {
          const slug = String(d.codeSlug).trim().toUpperCase();
          const agentsCount = udRows.filter((r) => String(r.domainSlug || '').toUpperCase() === slug).length;
          return {
            codeSlug: slug,
            nomDomaine: String(d.nomDomaine || slug).trim(),
            agentsCount,
          };
        });
      }
    } catch (e) {
      console.warn('[territorial-kpi] extraDomains fallback:', e);
    }

    return res.json({
      ok: true,
      scope: {
        level: posture.level,
        levelLabel: LEVEL_LABELS[posture.level],
        territoryDisplay,
        subZoneHeading,
        activeSubZone: subFilter,
        availableSubZones: Array.from(subZonesSet).sort((a, b) => a.localeCompare(b, 'fr')),
        region: posture.region,
        departement: posture.departement,
        arrondissement: posture.arrondissement,
        commune: posture.commune,
        fullName: posture.fullName,
        grade: posture.grade,
        matricule: posture.matricule,
        roleMetierLabel: posture.roleMetierLabel,
        allowedDomains: posture.allowedDomains,
        operationalDomains: posture.operationalDomains,
      },
      chasse: chasseKpi,
      reboisement: reboisementKpi,
      alerte: alerteKpi,
      extraDomains,
    });
  } catch (err: any) {
    console.error('[GET /api/territorial-kpi/overview] erreur:', err);
    return res.status(500).json({ ok: false, message: err?.message || 'Erreur lors du calcul des KPI territoriaux' });
  }
});

export default router;
