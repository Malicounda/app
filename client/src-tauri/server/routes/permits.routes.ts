import { and, eq, like, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { hunters, huntingCampaigns, insertPermitSchema, permits, settings, taxes, users } from '../../shared/dist/schema.js';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// --- Helpers: calcul automatique de validité ---
type Campaign = {
  id: number;
  startDate: string;
  endDate: string;
  year: string;
  isActive: boolean;
};

const daysBetween = (start: Date, end: Date) => {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

async function getActiveCampaign(): Promise<Campaign | null> {
  try {
    const rows = await db.select().from(huntingCampaigns as any).where(eq((huntingCampaigns as any).isActive as any, true)).limit(1);
    if (rows && rows.length > 0) {
      const c = rows[0] as any;
      return {
        id: Number(c.id),
        startDate: String(c.startDate),
        endDate: String(c.endDate),
        year: String(c.year),
        isActive: Boolean(c.isActive)
      };
    }
  } catch (e) {
    console.warn('[PERMITS] Impossible de charger la campagne active:', e);
  }
  return null;
}

async function getTouristDurationsConfig(): Promise<Record<string, number> | null> {
  try {
    const rows = await db.select().from(settings as any).where(eq((settings as any).key as any, 'permit.tourist_durations')).limit(1);
    if (rows && rows.length > 0) {
      const raw = (rows[0] as any).value as string;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, number>;
      } catch {}
    }
  } catch (e) {
    console.warn('[PERMITS] Impossible de charger settings permit.tourist_durations:', e);
  }
  return null;
}

async function computeTouristValidityDays(categoryId?: string): Promise<number | null> {
  if (!categoryId) return null;
  const cat = categoryId.toLowerCase();
  if (cat.includes('touriste') || cat.includes('touristique')) {
    // 1) Prendre la config DB si définie
    const cfg = await getTouristDurationsConfig();
    if (cfg) {
      // Parcourir les clés (mots-clés) et retourner la première qui matche
      for (const [keyword, days] of Object.entries(cfg)) {
        if (cat.includes(keyword.toLowerCase())) {
          const n = Number(days);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
    }
    // 2) Fallback alias par défaut
    if (cat.includes('1-semaine') || cat.includes('1semaine') || cat.includes('7j') || cat.includes('7-jours')) return 7;
    if (cat.includes('2-semaines') || cat.includes('2semaines') || cat.includes('14j') || cat.includes('14-jours')) return 14;
    if (cat.includes('1-mois') || cat.includes('1mois') || cat.includes('30j') || cat.includes('30-jours')) return 30;
    return 7; // défaut touriste si non précisé
  }
  return null;
}

async function computeValidityAndExpiry(params: {
  issueDate: Date;
  categoryId?: string | null;
}): Promise<{ validityDays: number; expiryDate: string } | null> {
  try {
    const { issueDate } = params;
    const categoryKey = params.categoryId || undefined;
    const touristDays = await computeTouristValidityDays(categoryKey);
    const campaign = await getActiveCampaign();

    // Stratégie:
    // 1) Si la catégorie a default_validity_days en DB -> prioritaire
    // 2) Sinon si catégorie touriste -> durées courtes (7/14/30) via settings/alias
    // 3) Sinon -> valider jusqu'à la fin de la campagne active
    // 4) Toujours plafonner à la date de fin de campagne si disponible

    let baseValidity = 0;
    let defaultDaysFromCategory: number | null = null;
    let subcategoryHint: string | null = null;
    try {
      if (categoryKey && typeof categoryKey === 'string') {
        // Lire default_validity_days et sous_categorie depuis permit_categories selon la key
        const rows: any[] = await db.execute(sql.raw(`
          SELECT default_validity_days, sous_categorie FROM permit_categories WHERE key = '${categoryKey.replace(/'/g, "''")}' LIMIT 1
        `));
        if (Array.isArray(rows) && rows.length > 0) {
          const v = rows[0]?.default_validity_days;
          const sc = rows[0]?.sous_categorie;
          subcategoryHint = (sc !== undefined && sc !== null) ? String(sc) : null;
          if (v !== null && v !== undefined && Number.isFinite(Number(v))) {
            defaultDaysFromCategory = Number(v);
          }
        }
      }
    } catch (e) {
      console.warn('[PERMITS] Impossible de lire default_validity_days pour la catégorie:', e);
    }

    if (typeof defaultDaysFromCategory === 'number') {
      baseValidity = defaultDaysFromCategory;
    } else if (typeof touristDays === 'number') {
      baseValidity = touristDays;
    } else if (subcategoryHint) {
      // Déduire depuis sous-categorie si présente et que default_validity_days est absent
      const sc = subcategoryHint.toLowerCase();
      if (sc.includes('1-semaine') || sc.includes('1 semaine') || sc.includes('1semaine') || sc.includes('7')) baseValidity = 7;
      else if (sc.includes('2-semaines') || sc.includes('2 semaines') || sc.includes('2semaines') || sc.includes('14')) baseValidity = 14;
      else if (sc.includes('1-mois') || sc.includes('1 mois') || sc.includes('30')) baseValidity = 30;
    } else if (campaign) {
      // Base: jusqu'à la fin de campagne si pas de durée explicite
      const end = new Date(campaign.endDate);
      baseValidity = Math.max(1, daysBetween(issueDate, end));
    } else {
      // Fallback si pas de campagne active
      baseValidity = 365; // défaut 1 an si aucun paramétrage
    }

    let rawExpiry = new Date(issueDate);
    rawExpiry.setDate(rawExpiry.getDate() + baseValidity);

    // Si une campagne est active, appliquer aussi le bornage par Périodes spécifiques
    if (campaign) {
      const campaignEnd = new Date(campaign.endDate);

      // Déterminer le groupe depuis la catégorie
      const cat = (categoryKey || '').toString().toLowerCase();
      const groupCode = (() => {
        if (cat.includes('gibier-eau') || cat.includes('gibier_eau') || cat.includes('water')) return 'waterfowl';
        if (cat.includes('grande')) return 'big_game';
        if (cat.includes('petite')) return 'small_game';
        // défaut: pas de période spécifique
        return '';
      })();

      let periodEnd: Date | null = null;
      if (groupCode) {
        try {
          // 1) Priorité: période spécifique par catégorie (si la table existe)
          if (categoryKey) {
            try {
              const catRows: any[] = await db.execute(sql`
                SELECT end_date
                FROM hunting_campaign_category_periods
                WHERE campaign_id = ${campaign.id}
                  AND category_key = ${categoryKey}
                  AND (enabled IS DISTINCT FROM FALSE)
                ORDER BY end_date DESC
                LIMIT 1
              `);
              if (catRows && catRows.length > 0) {
                const endRaw = catRows[0]?.end_date;
                const dt = endRaw ? new Date(endRaw) : null;
                const parsed = (dt && !isNaN(dt.getTime())) ? dt : null;
                if (parsed) periodEnd = parsed;
              }
            } catch {
              // table absente ou colonne manquante -> ignorer
            }
          }

          // 2) Fallback: période globale par type (big/small/waterfowl)
          if (!periodEnd) {
            const rows: any[] = await db.execute(sql`
              SELECT end_date
              FROM hunting_campaign_periods
              WHERE campaign_id = ${campaign.id} AND code = ${groupCode} AND (enabled IS DISTINCT FROM FALSE)
              ORDER BY end_date DESC
              LIMIT 1
            `);
            if (rows && rows.length > 0) {
              const endRaw = rows[0]?.end_date;
              const dt = endRaw ? new Date(endRaw) : null;
              periodEnd = (dt && !isNaN(dt.getTime())) ? dt : null;
            }
          }
        } catch (e) {
          // ignorer: si table absente ou colonne manquante, on reste sur bornage par campagne
        }
      }

      // Choisir la date plafond: priorité à la période (si disponible), sinon fin de campagne
      const clampTarget = periodEnd || campaignEnd;
      if (clampTarget && clampTarget >= issueDate && rawExpiry > clampTarget) {
        rawExpiry = clampTarget;
        baseValidity = Math.max(1, daysBetween(issueDate, clampTarget));
      }
    }

    const expiryISO = rawExpiry.toISOString().split('T')[0];
    return { validityDays: baseValidity, expiryDate: expiryISO };
  } catch (e) {
    console.warn('[PERMITS] Échec du calcul automatique de validité:', e);
    return null;
  }
}

// Route pour rechercher des permis par numéro de permis
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Paramètre de recherche requis' });
    }

    // Rechercher les permis par numéro de permis
    const searchResults = await db.select({
      id: permits.id,
      permitNumber: permits.permitNumber,
      hunterId: permits.hunterId,
      issueDate: permits.issueDate,
      expiryDate: permits.expiryDate,
      status: permits.status,
      type: permits.type,
      categoryId: permits.categoryId
    })
    .from(permits)
    .where(
      or(
        eq(permits.permitNumber, query),
        like(permits.permitNumber, `%${query}%`)
      )
    )
    .limit(10); // Limiter les résultats pour éviter la surcharge

    res.json(searchResults);
  } catch (error) {
    console.error('Erreur lors de la recherche de permis:', error);
    res.status(500).json({ message: 'Échec de la recherche de permis' });
  }
});

// Renouveler un permis (endpoint dédié)
router.post('/:id/renew', isAuthenticated, async (req, res) => {
  try {
    const permitId = Number(req.params.id);
    if (!Number.isFinite(permitId)) {
      return res.status(400).json({ message: 'ID de permis invalide' });
    }

    const currentUser = req.user as any;
    const role = String(currentUser?.role || '');
    const userId = Number(currentUser?.id || 0);

    // Charger le permis
    const existingPermitRows: any[] = await db.execute(sql`SELECT * FROM permits WHERE id = ${permitId} LIMIT 1`);
    if (!Array.isArray(existingPermitRows) || existingPermitRows.length === 0) {
      return res.status(404).json({ message: 'Permis non trouvé' });
    }
    const row: any = existingPermitRows[0];

    // Lire le feature flag
    let agentPermitAccessEnabled = false;
    try {
      const rows: any[] = await db.select().from(settings as any).where(eq((settings as any).key as any, 'agent_permit_access')).limit(1);
      if (rows && rows.length > 0) {
        const raw = (rows[0] as any).value as any;
        if (typeof raw === 'string') {
          try {
            if (raw === 'true' || raw === 'false') agentPermitAccessEnabled = (raw === 'true');
            else agentPermitAccessEnabled = !!JSON.parse(raw)?.enabled;
          } catch { agentPermitAccessEnabled = raw === 'true'; }
        } else if (raw && typeof raw === 'object') {
          agentPermitAccessEnabled = !!(raw as any).enabled;
        }
      }
    } catch {}
    const roleLc = role.toLowerCase();
    const isAgentLike = roleLc.includes('agent') || roleLc === 'regional' || roleLc === 'secteur' || roleLc.includes('sector');
    console.log(`[PERMITS DEBUG][POST /api/permits/${permitId}/renew] userId=${userId} role=${role} flag=${agentPermitAccessEnabled} isAgentLike=${isAgentLike}`);

    // Autorisation: admin toujours, sinon agent-like si flag actif; sinon 403
    if (!(role === 'admin' || (agentPermitAccessEnabled && isAgentLike))) {
      return res.status(403).json({ message: "Accès refusé: vous n'êtes pas autorisé à renouveler ce permis." });
    }

    // Valider et normaliser la quittance
    const rn = String((req.body?.receiptNumber || '')).toUpperCase().trim();
    const m = rn.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
    if (!m) {
      return res.status(400).json({ message: "Numéro de quittance invalide (ex: 1234567/24 AB)" });
    }
    const normalizedReceipt = `${m[1]}/${m[2]} ${m[3]}`;

    // Unicité cross-tables (autoriser si identique à l'actuel)
    const currentReceipt = String(row?.receipt_number ?? row?.receiptNumber ?? '').toUpperCase();
    if (!currentReceipt || currentReceipt !== normalizedReceipt) {
      const dupPermit = await db.execute(sql.raw(`SELECT 1 FROM permits WHERE receipt_number = '${normalizedReceipt.replace(/'/g, "''")}' LIMIT 1`));
      if (Array.isArray(dupPermit) && dupPermit.length > 0) {
        return res.status(409).json({ message: "N° de quittance déjà utilisé (permis)." });
      }
      const dupTax = await db.execute(sql.raw(`SELECT 1 FROM taxes WHERE receipt_number = '${normalizedReceipt.replace(/'/g, "''")}' LIMIT 1`));
      if (Array.isArray(dupTax) && dupTax.length > 0) {
        return res.status(409).json({ message: "N° de quittance déjà utilisé (taxe)." });
      }
    }

    // Calcul auto de la nouvelle période (issue aujourd'hui)
    const baseIssue = new Date();
    const effectiveCategory: string | undefined = String((row?.category_id ?? row?.categoryId) || '').trim();
    let auto: { validityDays: number; expiryDate: string } | null = null;
    try {
      auto = await computeValidityAndExpiry({ issueDate: baseIssue, categoryId: effectiveCategory });
    } catch (e) {
      console.warn('[POST /api/permits/:id/renew] computeValidityAndExpiry failed:', e);
    }

    const updateData: any = {};
    if (auto) {
      updateData.issueDate = baseIssue.toISOString().split('T')[0];
      updateData.expiryDate = auto.expiryDate;
      updateData.validityDays = auto.validityDays;
      const exp = new Date(auto.expiryDate);
      updateData.status = exp > new Date() ? 'active' : 'expired';
    }

    // Mettre à jour metadata (historique des renouvellements)
    let metadataObj: any = row?.metadata;
    try { if (typeof metadataObj === 'string') metadataObj = JSON.parse(metadataObj); } catch {}
    if (!metadataObj || typeof metadataObj !== 'object') metadataObj = {};
    const renewals: any[] = Array.isArray(metadataObj.renewals) ? [...metadataObj.renewals] : [];
    // Normaliser l'information d'agent pour l'affichage: Secteur/Departement ou Région
    const uiRole = (() => {
      const rl = role.toLowerCase();
      if (rl.includes('sub-agent') || rl.includes('secteur') || rl.includes('sector')) return 'secteur';
      // Pour les agents régionaux, utiliser 'IREF' afin que le front affiche Région correctement
      if (rl.includes('agent')) return 'IREF';
      return rl;
    })();
    const byRegion = String((currentUser as any)?.region || '').trim();
    const byDepartement = String((currentUser as any)?.departement || (currentUser as any)?.department || (currentUser as any)?.zone || '').trim();
    renewals.push({
      date: new Date().toISOString(),
      by: {
        id: userId,
        role: uiRole,
        region: byRegion,
        zone: byDepartement, // utilisé côté UI pour afficher "Région / Zone"; ici zone = département pour agents de secteur
        departement: byDepartement,
      }
    });
    metadataObj.renewals = renewals;
    metadataObj.renewCount = renewals.length;
    updateData.metadata = metadataObj;
    updateData.receiptNumber = normalizedReceipt;

    // Persister
    const updated = await db.update(permits).set(updateData).where(eq(permits.id, permitId)).returning();
    if (!updated || updated.length === 0) {
      return res.status(500).json({ message: 'Échec du renouvellement du permis' });
    }

    // Historique
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: 'renew',
      entityType: 'permit',
      entityId: permitId,
      details: `Renouvellement du permis ${updated[0]?.permitNumber || 'ID ' + permitId}`,
    });

    return res.json(updated);
  } catch (error) {
    console.error('Erreur lors du renouvellement du permis:', error);
    return res.status(500).json({ message: "Erreur lors du renouvellement du permis" });
  }
});

// Créer un nouveau permis
router.post('/', isAuthenticated, async (req, res) => {
  try {
    // Debug: log incoming body to trace validation issues
    console.log('[POST /api/permits] Payload reçu:', req.body);
    // Valider et parser les données de la requête
    // Rendre expiryDate optionnel au moment de la création (calculé par le backend)
    const creationSchema = (insertPermitSchema as any).partial({ expiryDate: true });
    const validatedData = creationSchema.parse({
      ...req.body,
      hunterId: Number(req.body.hunterId),
      price: Number(req.body.price)
    });

    // Utiliser le numéro de permis envoyé par le frontend
    const permitNumber = validatedData.permitNumber || req.body.permitNumber;

    if (!permitNumber) {
      console.error(`❌ Aucun numéro de permis fourni`);
      return res.status(400).json({ message: "Numéro de permis requis" });
    }

    // Vérifier que le numéro est unique
    const existing = await db.select().from(permits).where(eq(permits.permitNumber, permitNumber)).limit(1);
    if (existing.length > 0) {
      console.error(`❌ Numéro de permis déjà existant: ${permitNumber}`);
      return res.status(409).json({ message: "Ce numéro de permis existe déjà" });
    }

    console.log(`✅ Utilisation du numéro de permis: ${permitNumber}`);

    // Vérifier le scope de l'émetteur vis-à-vis du chasseur ciblé
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const userRegion = String(currentUser?.region || '');
    const userDepartement = String((currentUser as any)?.departement || (currentUser as any)?.zone || '');

    // Charger la région/département et l'état actif du chasseur
    const hunterScope: any[] = await db.execute(sql.raw(`
      SELECT region, departement, is_active AS "isActive" FROM hunters WHERE id = ${Number(validatedData.hunterId)} LIMIT 1
    `));
    if (!hunterScope.length) {
      return res.status(400).json({ message: 'Chasseur introuvable' });
    }
    const hunterRegion = String((hunterScope[0] as any).region || '');
    const hunterDepartement = String((hunterScope[0] as any).departement || '');
    const hunterIsActive = Boolean((hunterScope[0] as any).isActive);

    // Interdiction: chasseur suspendu/désactivé ne peut pas recevoir de permis
    if (!hunterIsActive) {
      return res.status(409).json({ message: "Ce chasseur est suspendu/désactivé. Réactivation requise avant la délivrance d'un permis." });
    }

    let insertData: Omit<typeof permits.$inferInsert, 'expiryDate'> & { expiryDate?: string } = {
      // Exclure permitNumber de validatedData pour s'assurer que celui généré est utilisé
      ...(Object.fromEntries(Object.entries(validatedData).filter(([key]) => key !== 'permitNumber')) as Omit<typeof validatedData, 'permitNumber'>),
      hunterId: validatedData.hunterId, // Assurer que hunterId est bien un nombre
      price: validatedData.price.toString(), // Assurer que price est bien une chaîne
      permitNumber: permitNumber as string, // Utiliser le permitNumber généré
      // Convertir les dates en chaînes ISO pour la base de données
      issueDate: typeof validatedData.issueDate === 'string'
        ? validatedData.issueDate
        : validatedData.issueDate.toISOString().split('T')[0],
      // expiryDate peut être absent: il sera calculé automatiquement plus bas
      ...(validatedData.expiryDate ? {
        expiryDate: typeof validatedData.expiryDate === 'string'
          ? validatedData.expiryDate
          : (validatedData.expiryDate as Date).toISOString().split('T')[0]
      } : {}),
      // Champs optionnels
      ...(validatedData.metadata && { metadata: validatedData.metadata }),
      // Enregistrer l'émetteur du permis
      createdBy: Number((req as any)?.user?.id || 0),
    };

    // Appliquer le calcul automatique si validityDays/expiryDate non fournis par logique d'appel
    try {
      const hasProvidedExpiry = Boolean((req.body as any)?.expiryDate);
      const effectiveIssue = new Date(insertData.issueDate as string);
      if (!hasProvidedExpiry || !(req.body as any)?.validityDays) {
        const auto = await computeValidityAndExpiry({
          issueDate: effectiveIssue,
          categoryId: (validatedData as any)?.categoryId || (req.body as any)?.categoryId
        });
        if (auto) {
          insertData = {
            ...insertData,
            validityDays: auto.validityDays,
            expiryDate: auto.expiryDate,
          };
        }
      }
    } catch (e) {
      console.warn('[POST /api/permits] Skip auto-validity (non-bloquant):', e);
    }

    // Sécurité: s'assurer que expiryDate est bien défini avant insertion (colonne NOT NULL)
    if (!insertData.expiryDate) {
      insertData.expiryDate = String(insertData.issueDate);
    }

    console.log(`🔍 Débogage avant insertion:`, {
      permitNumber,
      permitNumber_in_data: insertData.permitNumber,
      hunterId: insertData.hunterId
    });

    // Validation & Unicité du N° de quittance (receiptNumber)
    try {
      const rn = (insertData as any)?.receiptNumber ?? (req.body as any)?.receiptNumber;
      if (rn && String(rn).trim()) {
        // Normaliser: uppercase, autoriser ' ', '.' avant les lettres et accepter sans espace. Canonique: 'NNNNNNN/NN LL'
        let raw = String(rn).toUpperCase().trim();
        raw = raw.replace(/[.]/g, '.'); // conserver les points temporairement
        // Capturer variantes: 1234567/22JS | 1234567/22 JS | 1234567/22.JS
        const m = raw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
        if (!m) {
          return res.status(400).json({ message: "Numéro invalide (ex: 1234567/22 JS)" });
        }
        const normalized = `${m[1]}/${m[2]} ${m[3]}`;
        (insertData as any).receiptNumber = normalized;
        // Vérifier dans permits
        const dupP: any[] = await db.execute(sql.raw(`
          SELECT 1 FROM permits WHERE receipt_number = ${sql.raw(`'${normalized.replace(/'/g, "''")}'`)} LIMIT 1
        `));
        if (Array.isArray(dupP) && dupP.length > 0) {
          return res.status(409).json({ message: "N° de quittance déjà utilisé (permis)." });
        }
        // Vérifier dans taxes si colonne existe; tester plusieurs noms possibles
        const colCheck: any[] = await db.execute(sql.raw(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='taxes' AND column_name IN ('receipt_number','receiptNumber','quittance')
        `));
        const names = Array.isArray(colCheck) ? (colCheck as any[]).map(r => r.column_name as string) : [];
        for (const cname of names) {
          try {
            const qs = `SELECT 1 FROM taxes WHERE ${cname} = '${normalized.replace(/'/g, "''")}' LIMIT 1`;
            const r: any[] = await db.execute(sql.raw(qs));
            if (Array.isArray(r) && r.length > 0) {
              return res.status(409).json({ message: "N° de quittance déjà utilisé (taxe)." });
            }
          } catch {}
        }
      }
    } catch {}

    // Règle métier:
    // - Un seul permis ACTIF par grande catégorie (résident, coutumier, touriste) pour un chasseur,
    //   mais en EXCLUANT les permis "gibier d'eau" qui sont cumulables.
    // - Pour le "gibier d'eau": cumulable avec les autres catégories, mais un chasseur ne peut pas
    //   détenir deux permis de gibier d'eau actifs non expirés.
    try {
      const catRaw: any = (validatedData as any)?.categoryId ?? (req.body as any)?.categoryId ?? '';
      const cat = typeof catRaw === 'string' ? catRaw.toLowerCase() : '';
      if (!cat) {
        return res.status(400).json({ message: "Catégorie du permis (categoryId) requise" });
      }
      const isGibierEau = cat.includes('gibier-eau');
      if (isGibierEau) {
        // Interdire un deuxième permis Gibier d'Eau sauf si l'existant est "épuisé"
        // Épuisé = (renouvellements >= 2) OU (expiré)
        const conflictRows: any[] = await db.execute(sql.raw(`
          SELECT p.id, p.permit_number AS "permitNumber", p.category_id AS "categoryId", p.metadata, p.expiry_date AS "expiryDate"
          FROM permits p
          WHERE p.hunter_id = ${Number(validatedData.hunterId)}
            AND p.status = 'active'
            AND (p.category_id ILIKE '%gibier-eau%')
          ORDER BY p.created_at DESC
          LIMIT 1
        `));
        if (Array.isArray(conflictRows) && conflictRows.length > 0) {
          const c = conflictRows[0] as any;
          // Considérer expiré
          const isExpired = !!c?.expiryDate && new Date(c.expiryDate) < new Date();
          // Compter les renouvellements si metadata JSON présent
          let renewalsCount = 0;
          try {
            let meta = c?.metadata;
            if (typeof meta === 'string') { meta = JSON.parse(meta); }
            if (meta && Array.isArray(meta.renewals)) { renewalsCount = meta.renewals.length; }
            else if (meta && typeof meta.renewalCount === 'number') { renewalsCount = meta.renewalCount; }
          } catch {}
          const isEpuisé = (renewalsCount >= 2) && isExpired;
          if (!isEpuisé) {
            return res.status(409).json({
              message: "Ce chasseur détient déjà un permis de Gibier d'Eau actif non épuisé (il doit être expiré ET avoir atteint 2 renouvellements).",
              existingPermit: { id: c.id, permitNumber: c.permitNumber, categoryId: c.categoryId, renewalsCount }
            });
          }
        }
      } else {
        // Catégories classiques: résident/coutumier/touriste (exclure gibier d'eau du contrôle de groupe)
        let whereGroup = '';
        if (cat.includes('resident')) {
          whereGroup = "(p.category_id ILIKE 'resident-%')";
        } else if (cat.includes('coutumier')) {
          whereGroup = "(p.category_id ILIKE 'coutumier-%')";
        } else if (cat.includes('touriste') || cat.includes('touristique')) {
          whereGroup = "(p.category_id ILIKE 'touriste-%' OR p.category_id ILIKE 'touristique-%')";
        } else {
          const prefix = cat.split('-')[0].replace(/'/g, "''");
          whereGroup = `(p.category_id ILIKE '${prefix}-%')`;
        }
        const conflictRows: any[] = await db.execute(sql.raw(`
          SELECT p.id, p.permit_number AS "permitNumber", p.category_id AS "categoryId"
          FROM permits p
          WHERE p.hunter_id = ${Number(validatedData.hunterId)}
            AND p.status = 'active'
            AND p.expiry_date >= CURRENT_DATE
            AND ${whereGroup}
            AND (p.category_id NOT ILIKE '%gibier-eau%')
          LIMIT 1
        `));
        if (Array.isArray(conflictRows) && conflictRows.length > 0) {
          const c = conflictRows[0] as any;
          return res.status(409).json({
            message: "Ce chasseur possède déjà un permis actif dans cette grande catégorie (hors Gibier d'Eau).",
            existingPermit: { id: c.id, permitNumber: c.permitNumber, categoryId: c.categoryId }
          });
        }
      }
    } catch (e) {
      console.warn('[POST /api/permits] Vérification unicité par catégorie échouée (non bloquant):', e);
    }

    // Préparer un objet final avec expiryDate non optionnel pour Drizzle
    const finalData: typeof permits.$inferInsert = {
      ...(insertData as any),
      expiryDate: String(insertData.expiryDate),
    };

    // Créer le permis dans la base de données
    let newPermit;
    try {
      if (!finalData.permitNumber) {
        throw new Error("Numéro de permis non généré");
      }
      newPermit = await db.insert(permits)
        .values(finalData)
        .returning();
    } catch (err: any) {
      if (err?.code === '23505') {
        // Doublon malgré tout
        return res.status(409).json({ message: "Numéro de permis déjà existant. Veuillez réessayer." });
      }
      throw err;
    }
    if (!newPermit) {
      throw new Error("Échec de la création du permis");
    }

    // Mettre à jour l'historique avec l'ID réel du permis
    await storage.createHistory({
      userId: Number((req as any)?.user?.id || 0),
      operation: "create",
      entityType: "permit",
      entityId: newPermit[0].id,
      details: `Nouveau permis créé: ${newPermit[0].permitNumber}`
    });

    res.status(201).json(newPermit);
  } catch (error) {
    // Surface Zod validation errors with details to help diagnose
    if (error instanceof z.ZodError) {
      console.error('[POST /api/permits] Erreur de validation Zod:', error.issues);
      return res.status(400).json({
        message: 'Données invalides',
        type: 'zod_validation_error',
        issues: error.issues,
      });
    }
    // Fallback error handler
    console.error('[POST /api/permits] Erreur lors de la création du permis:', error);
    return res.status(500).json({ message: 'Erreur lors de la création du permis' });
  }
});

// Vérifier l'éligibilité à la réactivation d'un permis suspendu
router.get('/:id/reactivation-eligibility', isAuthenticated, async (req, res) => {
  try {
    const permitId = Number(req.params.id);
    if (Number.isNaN(permitId)) {
      return res.status(400).json({ allowed: false, reason: 'ID invalide' });
    }

    const currentPermit = await db.query.permits.findFirst({ where: eq(permits.id, permitId) });
    if (!currentPermit) {
      return res.status(404).json({ allowed: false, reason: 'Permis non trouvé' });
    }

    if (currentPermit.status !== 'suspended') {
      return res.json({ allowed: false, reason: 'Permis non suspendu' });
    }

    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    // Dernier suspendeur
    let suspenderId: number | null = null;
    try {
      const rows: any[] = await db.execute(sql.raw(`
        SELECT user_id AS "userId"
        FROM history
        WHERE entity_type = 'permit' AND entity_id = ${permitId} AND operation IN ('suspend')
        ORDER BY created_at DESC
        LIMIT 1
      `));
      suspenderId = (Array.isArray(rows) && rows[0] && rows[0].userId) ? Number(rows[0].userId) : null;
    } catch {}

    // Région de l'émetteur
    let issuerRegion = '';
    try {
      const issuerRows = await db
        .select({ region: users.region })
        .from(users)
        .where(eq(users.id, Number(currentPermit.createdBy)));
      issuerRegion = (issuerRows[0]?.region || '') as string;
    } catch {}

    const isAdmin = role === 'admin';
    const isSuspender = suspenderId !== null && Number(userId) === Number(suspenderId);
    const isRegionalOfIssuer = role === 'agent' && issuerRegion && region && issuerRegion.toLowerCase() === region.toLowerCase();

    const allowed = Boolean(isAdmin || isSuspender || isRegionalOfIssuer);
    const reason = allowed ? 'ok' : "Seuls l'administrateur, l'agent ayant suspendu, ou l'agent régional de l'émetteur peuvent réactiver";
    return res.json({ allowed, suspenderId, issuerRegion, reason });
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'éligibilité:', error);
    return res.status(500).json({ allowed: false, reason: 'Erreur serveur' });
  }
});

// Route pour récupérer tous les permis (scopés par l'émetteur)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const currentUser = (req as any).user as any;
    const role = currentUser?.role;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    console.log(`[PERMITS DEBUG] Utilisateur connecté: ${currentUser?.username} (${role}) - region=${region}`);

    if (role === 'admin') {
      const adminPermits = await db.execute(sql.raw(`
        SELECT
          p.id,
          p.permit_number AS "permitNumber",
          p.hunter_id AS "hunterId",
          p.issue_date AS "issueDate",
          p.expiry_date AS "expiryDate",
          p.validity_days AS "validityDays",
          p.status,
          p.price,
          p.type,
          p.category_id AS "categoryId",
          p.receipt_number AS "receiptNumber",
          p.area,
          p.weapons,
          p.metadata,
          p.created_at AS "createdAt",
          p.created_by AS "createdBy",
          -- Issuer info
          u.id AS "issuerId",
          u.role AS "issuerRole",
          u.region AS "issuerRegion",
          u.departement AS "issuerDepartement",
          u.username AS "issuerUsername",
          u.first_name AS "issuerFirstName",
          u.last_name AS "issuerLastName",
          -- Hunter info
          h.first_name AS "hunterFirstName",
          h.last_name AS "hunterLastName",
          h.id_number AS "hunterIdNumber",
          h.region AS "hunterRegion",
          h.departement AS "hunterDepartement"
        FROM permits p
        LEFT JOIN hunters h ON p.hunter_id = h.id
        LEFT JOIN users u ON p.created_by = u.id
        ORDER BY p.created_at DESC
      `));
      // Recalcul dynamique (Option A)
      const enriched = await Promise.all((adminPermits as any[]).map(async (p: any) => {
        try {
          const auto = await computeValidityAndExpiry({
            issueDate: p.issueDate ? new Date(p.issueDate) : new Date(),
            categoryId: p.categoryId || undefined,
          });
          if (auto) {
            return { ...p, computedEffectiveValidityDays: auto.validityDays, computedEffectiveExpiry: auto.expiryDate };
          }
        } catch {}
        return { ...p };
      }));
      console.log(`[PERMITS DEBUG] Nombre de permis (admin avec issuer): ${Array.isArray(enriched) ? enriched.length : 0}`);
      return res.json(enriched);
    }

    // Lire le feature flag agent_permit_access
    let agentPermitAccessEnabled = false;
    try {
      const rows: any[] = await db.select().from(settings).where(eq(settings.key, 'agent_permit_access')).limit(1);
      if (rows && rows.length > 0) {
        const raw = (rows[0] as any).value as any;
        if (typeof raw === 'string') {
          try {
            if (raw === 'true' || raw === 'false') agentPermitAccessEnabled = (raw === 'true');
            else agentPermitAccessEnabled = !!JSON.parse(raw)?.enabled;
          } catch { agentPermitAccessEnabled = raw === 'true'; }
        } else if (raw && typeof raw === 'object') {
          agentPermitAccessEnabled = !!(raw as any).enabled;
        }
      }
    } catch {}

    // Déterminer les IDs d'utilisateurs dont on peut voir les permis (par émetteur)
    let allowedUserIds: number[] = [userId];

    if (role === 'agent') {
      // Agent régional: lui-même + tous les agents de secteur de sa région
      const subAgents = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
      const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
      allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
    } else if (role === 'sub-agent') {
      // Agent de secteur: seulement lui-même
      allowedUserIds = [userId];
    }

    // Si le flag est actif: inclure aussi les permis que l'utilisateur a renouvelés (dans metadata.renewals)
    const renewedByUserCondition = agentPermitAccessEnabled
      ? ` OR (p.metadata::text ILIKE '%"by"%' AND p.metadata::text ILIKE '%"id": ${userId}%')`
      : '';

    const scopedPermits = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.permit_number AS "permitNumber",
        p.hunter_id AS "hunterId",
        p.issue_date AS "issueDate",
        p.expiry_date AS "expiryDate",
        p.validity_days AS "validityDays",
        p.status,
        p.price,
        p.type,
        p.category_id AS "categoryId",
        p.receipt_number AS "receiptNumber",
        p.area,
        p.weapons,
        p.metadata,
        p.created_at AS "createdAt",
        p.created_by AS "createdBy",
        -- Issuer info
        u.id AS "issuerId",
        u.role AS "issuerRole",
        u.region AS "issuerRegion",
        u.departement AS "issuerDepartement",
        u.username AS "issuerUsername",
        u.first_name AS "issuerFirstName",
        u.last_name AS "issuerLastName",
        -- Hunter info
        h.first_name AS "hunterFirstName",
        h.last_name AS "hunterLastName",
        h.id_number AS "hunterIdNumber",
        h.region AS "hunterRegion",
        h.departement AS "hunterDepartement"
      FROM permits p
      LEFT JOIN hunters h ON p.hunter_id = h.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE (
        p.created_by = ANY('{${allowedUserIds.join(',')}}'::int[])
        ${renewedByUserCondition}
      )
      ORDER BY p.created_at DESC
    `));
    const enriched = await Promise.all((scopedPermits as any[]).map(async (p: any) => {
      try {
        const auto = await computeValidityAndExpiry({
          issueDate: p.issueDate ? new Date(p.issueDate) : new Date(),
          categoryId: p.categoryId || undefined,
        });
        if (auto) {
          return { ...p, computedEffectiveValidityDays: auto.validityDays, computedEffectiveExpiry: auto.expiryDate };
        }
      } catch {}
      return { ...p };
    }));
    console.log(`[PERMITS DEBUG] Nombre de permis (createdBy in ${JSON.stringify(allowedUserIds)}): ${Array.isArray(enriched) ? enriched.length : 0}`);
    return res.json(enriched);
  } catch (error) {
    console.error('Erreur lors de la récupération des permis:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route de debug pour compter les permis (sans authentification)
router.get('/debug/count', async (req, res) => {
  try {
    const permits = await storage.getAllPermits();
    res.json({
      count: permits.length,
      sample: permits.slice(0, 2) // Premiers 2 permis pour debug
    });
  } catch (error) {
    console.error('Erreur lors du debug des permis:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour générer un numéro de permis unique
router.post('/generate-number', isAuthenticated, async (req, res) => {
  try {
    // Nouveau système de génération avec préfixe P et suffixe alphanumérique
    const currentYear = new Date().getFullYear();

    // Récupérer la séquence des permis existants pour cette année
    const sequence = await db.execute(sql`
      SELECT permit_number FROM permits
      WHERE permit_number LIKE ${`P-SN-${currentYear}-%`}
    `);

    // Générer un code alphanumérique de 5 caractères (sécurité maximale, évite les patterns)
    const generateAlphaNum = (num: number): string => {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let result = '';
      let attempts = 0;

      do {
        result = '';
        // Convertir en base 36 (chiffres + lettres) sur 5 positions
        for (let i = 0; i < 5; i++) {
          let value;
          if (i === 0) {
            // Premier caractère basé sur le numéro séquentiel + aléatoire
            value = (Math.floor(num / 100000) + Math.floor(Math.random() * 10) + attempts) % 36;
          } else if (i === 1) {
            // Deuxième caractère différent du premier
            do {
              value = (Math.floor(num / 1000) + Math.floor(Math.random() * 15) + attempts) % 36;
            } while (value === (Math.floor(num / 100000) + Math.floor(Math.random() * 10) + attempts) % 36);
          } else if (i === 2) {
            // Troisième caractère avec plus d'aléatoire
            value = (Math.floor(num / 10) + Math.floor(Math.random() * 20) + attempts) % 36;
          } else {
            // Les deux derniers caractères très aléatoires
            value = (num + sequence.length + 1 + Math.floor(Math.random() * 36) + i * 7 + attempts) % 36;
          }
          result = chars[value] + result;
        }
        attempts++;
      } while (hasRepetitivePattern(result) && attempts < 10);

      return result;
    };

    // Fonction pour détecter les patterns répétitifs
    const hasRepetitivePattern = (str: string): boolean => {
      // Vérifier si 3 caractères consécutifs ou plus sont identiques
      for (let i = 0; i <= str.length - 3; i++) {
        if (str[i] === str[i + 1] && str[i + 1] === str[i + 2]) {
          return true;
        }
      }

      // Vérifier les patterns spécifiques à éviter
      const badPatterns = ['000', '111', '222', '333', '444', '555', '666', '777', '888', '999',
                          'AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ',
                          'KKK', 'LLL', 'MMM', 'NNN', 'OOO', 'PPP', 'QQQ', 'RRR', 'SSS', 'TTT',
                          'UUU', 'VVV', 'WWW', 'XXX', 'YYY', 'ZZZ', '123', '234', '345', '456',
                          '567', '678', '789', 'ABC', 'BCD', 'CDE', 'DEF'];

      return badPatterns.some(pattern => str.includes(pattern));
    };

    const alphaNum = generateAlphaNum(sequence.length);
    const permitNumber = `P-SN-${currentYear}-${alphaNum}`;

    // Vérifier l'unicité (sécurité supplémentaire)
    const existingPermit = await storage.getPermitByNumber(permitNumber);
    if (existingPermit) {
      // En cas de collision rare, ajouter un suffixe aléatoire
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
      const finalPermitNumber = `${permitNumber}${randomLetter}`;
      res.json({ permitNumber: finalPermitNumber });
    } else {
      res.json({ permitNumber });
    }
  } catch (error) {
    console.error('Erreur lors de la génération du numéro de permis:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour récupérer les permis actifs du chasseur connecté
router.get('/hunter/active', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const hunterId = currentUser?.hunterId || currentUser?.hunter_id;
    const userId = currentUser?.id;
    const userRole = currentUser?.role;

    console.log(`[PERMITS DEBUG] /hunter/active -> userId=${userId}, hunterId=${hunterId}, role=${userRole}`);

    // Si l'utilisateur a un hunterId, récupérer ses permis directement
    if (hunterId) {
      const activePermits = await db.execute(sql.raw(`
        SELECT
          p.id,
          p.permit_number AS "permitNumber",
          p.type,
          p.category_id AS "categoryId",
          p.status,
          p.validity_days AS "validityDays",
          p.expiry_date AS "expiryDate"
        FROM permits p
        WHERE p.hunter_id = ${hunterId}
          AND p.status = 'active'
          AND p.expiry_date >= CURRENT_DATE
        ORDER BY p.created_at DESC
      `));

      console.log(`[PERMITS DEBUG] /hunter/active -> ${Array.isArray(activePermits) ? activePermits.length : 0} permis actifs pour hunterId=${hunterId}`);
      return res.json(activePermits);
    }

    // Si l'utilisateur est un chasseur mais n'a pas encore de hunterId,
    // essayer de trouver un profil chasseur associé via l'ID utilisateur
    if (userRole === 'hunter' && userId) {
      // Chercher un chasseur associé à cet utilisateur via la table d'historique
      const hunterFromHistory = await db.execute(sql.raw(`
        SELECT DISTINCT h.id as hunter_id
        FROM hunters h
        INNER JOIN history hi ON hi.entity_id = h.id
        WHERE hi.entity_type = 'hunter'
          AND hi.operation = 'create_hunter'
          AND hi.user_id = ${userId}
        LIMIT 1
      `));

      if (hunterFromHistory.length > 0) {
        const foundHunterId = (hunterFromHistory[0] as any).hunter_id;
        console.log(`[PERMITS DEBUG] Trouvé hunterId=${foundHunterId} via historique pour userId=${userId}`);

        const activePermits = await db.execute(sql.raw(`
          SELECT
            p.id,
            p.permit_number AS "permitNumber",
            p.type,
            p.category_id AS "categoryId",
            p.status,
            p.validity_days AS "validityDays",
            p.expiry_date AS "expiryDate"
          FROM permits p
          WHERE p.hunter_id = ${foundHunterId}
            AND p.status = 'active'
            AND p.expiry_date >= CURRENT_DATE
          ORDER BY p.created_at DESC
        `));

        console.log(`[PERMITS DEBUG] /hunter/active -> ${Array.isArray(activePermits) ? activePermits.length : 0} permis actifs pour hunterId=${foundHunterId} (via historique)`);
        return res.json(activePermits);
      }
    }

    // Aucun profil chasseur trouvé
    console.log(`[PERMITS DEBUG] Aucun profil chasseur trouvé pour userId=${userId}, role=${userRole}`);
    return res.json([]);
  } catch (error) {
    console.error("Erreur lors de la récupération des permis actifs:", error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route pour récupérer tous les permis du chasseur connecté
router.get('/hunter/my-permits', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const userIdFromToken = Number(currentUser?.id || 0);
    let effectiveHunterId: number | null = currentUser?.hunterId ? Number(currentUser.hunterId) : null;

    console.log('[PERMITS DEBUG] /hunter/my-permits - currentUser:', currentUser);
    console.log('[PERMITS DEBUG] /hunter/my-permits - hunterId (from JWT):', effectiveHunterId);

    // Fallback: si le JWT ne contient pas hunterId, le dériver depuis la table users
    if (!effectiveHunterId && userIdFromToken) {
      try {
        const urows = await db
          .select({ hunterId: users.hunterId })
          .from(users)
          .where(eq(users.id, userIdFromToken))
          .limit(1);
        const derived = urows && urows[0] ? Number(urows[0].hunterId) : null;
        if (derived) {
          effectiveHunterId = derived;
          console.log('[PERMITS DEBUG] /hunter/my-permits - hunterId dérivé depuis DB:', effectiveHunterId);
        } else {
          console.warn('[PERMITS DEBUG] /hunter/my-permits - Aucun hunterId en DB pour userId=', userIdFromToken);
        }
      } catch (e) {
        console.warn('[PERMITS DEBUG] /hunter/my-permits - Échec dérivation hunterId depuis DB:', e);
      }
    }

    if (!effectiveHunterId) {
      console.log('[PERMITS DEBUG] /hunter/my-permits - Aucun hunterId trouvé (JWT + DB)');
      return res.status(404).json({ message: 'Aucun profil chasseur associé' });
    }

    // Récupérer tous les permis du chasseur avec calcul de statut côté serveur
    const allPermits = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.permit_number AS "permitNumber",
        p.hunter_id AS "hunterId",
        p.issue_date AS "issueDate",
        p.expiry_date AS "expiryDate",
        p.validity_days AS "validityDays",
        p.status AS "dbStatus",
        p.price,
        p.type,
        p.category_id AS "categoryId",
        p.receipt_number AS "receiptNumber",
        p.area,
        p.weapons,
        p.metadata,
        p.created_at AS "createdAt",
        p.created_by AS "createdBy",
        -- Calculer le statut réel basé sur la date d'expiration
        CASE
          WHEN p.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN p.status = 'suspended' THEN 'suspended'
          ELSE 'active'
        END AS "calculatedStatus",
        -- Issuer info
        u.username AS "issuerUsername",
        u.first_name AS "issuerFirstName",
        u.last_name AS "issuerLastName",
        u.region AS "issuerRegion"
      FROM permits p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.hunter_id = ${effectiveHunterId}
      ORDER BY p.created_at DESC
    `));

    // Post-traitement pour ajouter les informations de renouvellement et utiliser le statut calculé
    const processedPermits = (allPermits as any[]).map(permit => {
      try {
        const metadata = typeof permit.metadata === 'string'
          ? JSON.parse(permit.metadata)
          : permit.metadata;

        const renewalCount = metadata?.renewalCount ||
                            metadata?.renewals?.length ||
                            0;

        // Déterminer le statut final basé sur le calcul serveur
        const finalStatus = permit.calculatedStatus;

        return {
          ...permit,
          renewalCount,
          metadata,
          status: finalStatus // Utiliser le statut calculé côté serveur
        };
      } catch (e) {
        console.warn(`[PERMITS] Erreur parsing metadata pour permis ${permit.permitNumber}:`, e);
        return {
          ...permit,
          renewalCount: 0,
          status: permit.calculatedStatus
        };
      }
    });

    console.log(`[PERMITS DEBUG] /hunter/my-permits -> ${processedPermits.length} permis pour hunterId=${effectiveHunterId}`);
    res.json(processedPermits);
  } catch (error) {
    console.error("Erreur lors de la récupération des permis du chasseur:", error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des permis.' });
  }
});

// Nouvelle route pour récupérer les permis d'un chasseur spécifique
router.get('/hunter/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const { hunterId } = req.params;
    const hunterIdNum = parseInt(hunterId, 10);

    if (isNaN(hunterIdNum)) {
      return res.status(400).json({ message: 'ID du chasseur invalide.' });
    }

    // Retourner les permis du chasseur avec informations d'émetteur et du chasseur
    const rows: any[] = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.permit_number AS "permitNumber",
        p.hunter_id AS "hunterId",
        p.issue_date AS "issueDate",
        p.expiry_date AS "expiryDate",
        p.validity_days AS "validityDays",
        p.status,
        p.price,
        p.type,
        p.category_id AS "categoryId",
        p.receipt_number AS "receiptNumber",
        p.area,
        p.weapons,
        p.metadata,
        p.created_at AS "createdAt",
        p.created_by AS "createdBy",
        -- Issuer info
        u.id AS "issuerId",
        u.role AS "issuerRole",
        u.region AS "issuerRegion",
        u.departement AS "issuerDepartement",
        u.username AS "issuerUsername",
        u.first_name AS "issuerFirstName",
        u.last_name AS "issuerLastName",
        -- Hunter info (utile pour affichage si besoin)
        h.first_name AS "hunterFirstName",
        h.last_name AS "hunterLastName",
        h.id_number AS "hunterIdNumber",
        h.region AS "hunterRegion",
        h.departement AS "hunterDepartement"
      FROM permits p
      LEFT JOIN hunters h ON p.hunter_id = h.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.hunter_id = ${hunterIdNum}
      ORDER BY p.created_at DESC
    `));

    console.log(`[PERMITS DEBUG] /hunter/${hunterIdNum} -> ${Array.isArray(rows) ? rows.length : 0} permis (avec issuer)`);
    res.json(rows);
  } catch (error) {
    console.error("Erreur lors de la récupération des permis du chasseur:", error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Mettre à jour un permis existant
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const permitId = parseInt(id, 10);

    // Vérifier d'abord si le permis existe
    const existingPermit = await db.execute(sql`
      SELECT * FROM permits WHERE id = ${permitId} LIMIT 1
    `);

    if (existingPermit.length === 0) {
      return res.status(404).json({ message: "Permis non trouvé" });
    }

    // Autorisations: admin illimité, sinon l'utilisateur doit être l'émetteur
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    // Feature flag: autoriser les agents à modifier/renouveler tous les permis (comme admin)
    let agentPermitAccessEnabled = false;
    try {
      const rows: any[] = await db.select().from(settings).where(eq(settings.key, 'agent_permit_access')).limit(1);
      if (rows && rows.length > 0) {
        const raw = (rows[0] as any).value as any;
        if (typeof raw === 'string') {
          try {
            if (raw === 'true' || raw === 'false') agentPermitAccessEnabled = (raw === 'true');
            else agentPermitAccessEnabled = !!JSON.parse(raw)?.enabled;
          } catch { agentPermitAccessEnabled = raw === 'true'; }
        } else if (raw && typeof raw === 'object') {
          agentPermitAccessEnabled = !!(raw as any).enabled;
        }
      }
    } catch {}
    const roleLc = (role || '').toLowerCase();
    const isAgentLike = roleLc.includes('agent') || roleLc === 'regional' || roleLc === 'secteur' || roleLc.includes('sector');
    console.log(`[PERMITS DEBUG][PUT /api/permits/${permitId}] userId=${userId} role=${role} flag.agent_permit_access=${agentPermitAccessEnabled} isAgentLike=${isAgentLike}`);
    if (!(role === 'admin' || (agentPermitAccessEnabled && isAgentLike))) {
      // Construire la liste des userIds autorisés (agent = lui + sub-agents de sa région, sub-agent = lui)
      let allowedUserIds: number[] = [userId];
      if (role === 'agent') {
        const subAgents = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
        const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
        allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
      }
      const row: any = existingPermit[0];
      const createdBy = Number(row?.created_by ?? row?.createdBy ?? NaN);
      if (!allowedUserIds.includes(createdBy)) {
        return res.status(403).json({ message: "Accès refusé: vous ne pouvez modifier que les permis que vous (ou vos agents de secteur) avez délivrés" });
      }
    }

    // Valider et parser les données de la requête
    const validatedData = insertPermitSchema.partial().parse(req.body);
    // Préparer l'objet de mise à jour avant toute utilisation
    const updateData: Partial<typeof permits.$inferInsert> = {};

    // Limite de renouvellement: maximum 2
    try {
      const row: any = existingPermit[0];
      const oldExpiryRaw = row?.expiry_date ?? row?.expiryDate;
      const oldExpiry = oldExpiryRaw ? new Date(oldExpiryRaw) : null;
      const newExpiryRaw = (validatedData as any)?.expiryDate;
      const newExpiry = newExpiryRaw
        ? (typeof newExpiryRaw === 'string' ? new Date(newExpiryRaw) : new Date(newExpiryRaw))
        : null;
      // Déterminer si c'est une tentative de renouvellement (date augmentée)
      const isRenewAttempt = oldExpiry && newExpiry && !isNaN(oldExpiry.getTime()) && !isNaN(newExpiry.getTime()) && newExpiry > oldExpiry;
      if (isRenewAttempt) {
        // Renouvellement détecté: recalculer automatiquement la validité et la nouvelle date d'expiration
        try {
          // Base du renouvellement = aujourd'hui (date d'émission implicite) afin de repartir pour une nouvelle période
          const baseIssue = new Date();
          const currentRow: any = existingPermit[0];
          const effectiveCategory: string | undefined = String((currentRow?.category_id ?? currentRow?.categoryId) || '').trim() || (validatedData as any)?.categoryId;
          const auto = await computeValidityAndExpiry({ issueDate: baseIssue, categoryId: effectiveCategory });
          if (auto) {
            // Fix: lors du renouvellement, on repart sur une nouvelle période -> mettre à jour la date d'émission
            (updateData as any).issueDate = baseIssue.toISOString().split('T')[0];
            (updateData as any).expiryDate = auto.expiryDate;
            (updateData as any).validityDays = auto.validityDays;
            // statut cohérent avec nouvelle date
            const exp = new Date(auto.expiryDate);
            (updateData as any).status = exp > new Date() ? 'active' : 'expired';
          }
        } catch (e) {
          console.warn('[PUT /api/permits/:id] Renouvellement: calcul auto-validity ignoré (non-bloquant):', e);
        }
      }
    } catch {}
    // NOTE: bloc de renouvellement détaillé supprimé ici pour corriger une corruption de syntaxe.
    // La validation détaillée du numéro de quittance lors d'un renouvellement est traitée plus bas.

    // Si l'utilisateur met à jour le numéro de quittance hors renouvellement, le valider/normaliser aussi
    if ((validatedData as any)?.receiptNumber && !(updateData as any).receiptNumber) {
      const rn = (validatedData as any).receiptNumber;
      let raw = String(rn).toUpperCase().trim();
      if (/PLACEDOR/i.test(raw)) {
        return res.status(400).json({ message: 'numéro invalide' });
      }
      const m = raw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
      if (!m) {
        return res.status(400).json({ message: "Numéro invalide (ex: 1234567/22 JS)" });
      }
      const normalized = `${m[1]}/${m[2]} ${m[3]}`;
      // Unicité cross-tables (permis+taxes). Autoriser si égal à l'actuel (pas de changement)
      const row: any = existingPermit[0];
      const currentReceipt = String(row?.receipt_number ?? row?.receiptNumber ?? '').toUpperCase();
      if (!currentReceipt || currentReceipt !== normalized) {
        const dupPermit = await db.execute(sql.raw(`SELECT 1 FROM permits WHERE receipt_number = '${normalized.replace(/'/g, "''")}' LIMIT 1`));
        if (Array.isArray(dupPermit) && dupPermit.length > 0) {
          return res.status(409).json({ message: "N° de quittance déjà utilisé (permis)." });
        }
        const dupTax = await db.execute(sql.raw(`SELECT 1 FROM taxes WHERE receipt_number = '${normalized.replace(/'/g, "''")}' LIMIT 1`));
        if (Array.isArray(dupTax) && dupTax.length > 0) {
          return res.status(409).json({ message: "N° de quittance déjà utilisé (taxe)." });
        }
      }
      (updateData as any).receiptNumber = normalized;
    }

    // Vérification d'unicité par catégorie (mêmes règles que POST) avant mise à jour
    try {
      const row: any = existingPermit[0];
      const effectiveHunterId = Number((validatedData as any)?.hunterId ?? row?.hunter_id ?? row?.hunterId);
      const effectiveCategory: string = String(((validatedData as any)?.categoryId ?? row?.category_id ?? row?.categoryId) || '').toLowerCase();
      if (!effectiveHunterId || !effectiveCategory) {
        // Si informations insuffisantes, ne pas bloquer
      } else {
        const isGibierEau = effectiveCategory.includes('gibier-eau');
        if (isGibierEau) {
          // Conflit waterfowl: interdire 2 actifs non épuisés (exclure ce permis)
          const conflictRows: any[] = await db.execute(sql.raw(`
            SELECT p.id, p.permit_number AS "permitNumber", p.category_id AS "categoryId", p.metadata, p.expiry_date AS "expiryDate"
            FROM permits p
            WHERE p.hunter_id = ${effectiveHunterId}
              AND p.status = 'active'
              AND (p.category_id ILIKE '%gibier-eau%')
              AND p.id <> ${permitId}
            ORDER BY p.created_at DESC
            LIMIT 1
          `));
          if (Array.isArray(conflictRows) && conflictRows.length > 0) {
            const c = conflictRows[0] as any;
            const isExpired = !!c?.expiryDate && new Date(c.expiryDate) < new Date();
            let renewalsCount = 0;
            try {
              let meta = c?.metadata;
              if (typeof meta === 'string') { meta = JSON.parse(meta); }
              if (meta && Array.isArray(meta.renewals)) { renewalsCount = meta.renewals.length; }
              else if (meta && typeof meta.renewalCount === 'number') { renewalsCount = meta.renewalCount; }
            } catch {}
            const isEpuisé = (renewalsCount >= 2) && isExpired;
            if (!isEpuisé) {
              return res.status(409).json({
                message: "Ce chasseur détient déjà un permis de Gibier d'Eau actif non épuisé (il doit être expiré ET avoir atteint 2 renouvellements).",
                existingPermit: { id: c.id, permitNumber: c.permitNumber, categoryId: c.categoryId, renewalsCount }
              });
            }
          }
        } else {
          // Conflit groupe (resident/coutumier/touriste), exclure waterfowl
          let whereGroup = '';
          if (effectiveCategory.includes('resident')) {
            whereGroup = "(p.category_id ILIKE 'resident-%')";
          } else if (effectiveCategory.includes('coutumier')) {
            whereGroup = "(p.category_id ILIKE 'coutumier-%')";
          } else if (effectiveCategory.includes('touriste') || effectiveCategory.includes('touristique')) {
            whereGroup = "(p.category_id ILIKE 'touriste-%' OR p.category_id ILIKE 'touristique-%')";
          } else {
            const prefix = effectiveCategory.split('-')[0].replace(/'/g, "''");
            whereGroup = `(p.category_id ILIKE '${prefix}-%')`;
          }
          const conflictRows: any[] = await db.execute(sql.raw(`
            SELECT p.id, p.permit_number AS "permitNumber", p.category_id AS "categoryId"
            FROM permits p
            WHERE p.hunter_id = ${effectiveHunterId}
              AND p.status = 'active'
              AND p.expiry_date >= CURRENT_DATE
              AND ${whereGroup}
              AND (p.category_id NOT ILIKE '%gibier-eau%')
              AND p.id <> ${permitId}
            LIMIT 1
          `));
          if (Array.isArray(conflictRows) && conflictRows.length > 0) {
            const c = conflictRows[0] as any;
            return res.status(409).json({
              message: "Ce chasseur possède déjà un permis actif dans cette grande catégorie (hors Gibier d'Eau).",
              existingPermit: { id: c.id, permitNumber: c.permitNumber, categoryId: c.categoryId }
            });
          }
        }
      }
    } catch (_) {
      // Ne pas bloquer si la vérification échoue
    }

    // Mettre à jour le permis avec les données validées

    // Copier et convertir les champs de validatedData vers updateData de manière type-safe
    for (const key in validatedData) {
      if (Object.prototype.hasOwnProperty.call(validatedData, key)) {
        const value = validatedData[key as keyof typeof validatedData];

        if (value !== undefined) {
          switch (key) {
            case 'hunterId':
              updateData.hunterId = Number(value);
              break;
            case 'price':
              updateData.price = String(value); // price dans la DB est string (numeric)
              break;
            case 'issueDate':
            case 'expiryDate':
              updateData[key] = typeof value === 'string'
                ? value
                : (value as Date).toISOString().split('T')[0];
              break;
            case 'permitNumber':
            case 'status':
            // case 'type': // 'type' n'est pas dans insertPermitSchema.partial() directement
            case 'categoryId':
            // 'receiptNumber' est validé/normalisé séparément plus bas si fourni hors renouvellement
            case 'area':
            case 'weapons':
              // Ces champs sont attendus comme string ou string | null | undefined
              if (value !== null && value !== undefined) {
                 (updateData as any)[key] = String(value);
              }
              break;
            case 'type': // Gérer 'type' spécifiquement s'il est dans insertPermitSchema
              if (validatedData.type !== undefined) updateData.type = validatedData.type;
              break;
            case 'metadata':
              updateData.metadata = value; // Doit être z.record(z.any()).optional()
              break;
            // Les autres champs de insertPermitSchema (comme 'id', 'createdAt') ne sont généralement pas mis à jour ici.
          }
        }
      }
    }

    // Déterminer et forcer le statut selon la nouvelle date d'expiration si fournie
    try {
      const expRaw = (validatedData as any)?.expiryDate;
      if (expRaw) {
        const exp = typeof expRaw === 'string' ? new Date(expRaw) : new Date(expRaw);
        if (!isNaN(exp.getTime())) {
          const now = new Date();
          // Si renouvelé (ou date future), repasse en actif. Sinon marqué expiré.
          updateData.status = exp > now ? 'active' : 'expired';
        }
      }
    } catch (_) {
      // Ne bloque pas en cas d'erreur de parsing
    }

    // Exécuter la mise à jour
    const updatedPermit = await db.update(permits)
      .set(updateData)
      .where(eq(permits.id, permitId))
      .returning();

    if (updatedPermit.length === 0) {
      return res.status(404).json({ message: "Échec de la mise à jour du permis" });
    }

    if (!updatedPermit) {
      return res.status(404).json({ message: "Permis non trouvé" });
    }

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: "update",
      entityType: "permit",
      entityId: permitId, // Correction: permitId est déjà un nombre
      details: `Mise à jour du permis: ${updatedPermit[0]?.permitNumber || 'ID ' + permitId}`
    });
    // Répondre avec le permis mis à jour
    return res.json(updatedPermit);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du permis:", error);
    return res.status(400).json({ message: "Échec de la mise à jour du permis" });
  }
});

// Suspendre / Réactiver un permis
router.patch('/:id/suspend', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const permitId = parseInt(id, 10);

    // Logique pour suspendre/réactiver, par exemple mettre à jour le statut
    // Ici, nous allons simplement inverser un statut hypothétique ou le définir
    // Assurez-vous d'avoir une colonne 'status' ou similaire dans votre table 'permits'
    const currentPermit = await db.query.permits.findFirst({ where: eq(permits.id, permitId) });
    if (!currentPermit) return res.status(404).json({ message: "Permis non trouvé" });

    // Autorisations
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    // Cas réactivation: statut actuel 'suspended' -> on veut 'active'
    const isReactivation = currentPermit.status === 'suspended';

    if (isReactivation) {
      // Trouver le dernier acteur ayant suspendu ce permis
      let suspenderId: number | null = null;
      try {
        const rows: any[] = await db.execute(sql.raw(`
          SELECT user_id AS "userId"
          FROM history
          WHERE entity_type = 'permit' AND entity_id = ${permitId} AND operation IN ('suspend')
          ORDER BY created_at DESC
          LIMIT 1
        `));
        suspenderId = (Array.isArray(rows) && rows[0] && rows[0].userId) ? Number(rows[0].userId) : null;
      } catch (_) {
        suspenderId = null;
      }

      // Récupérer la région de l'émetteur du permis
      let issuerRegion = '';
      try {
        const issuerRows = await db
          .select({ region: users.region })
          .from(users)
          .where(eq(users.id, Number(currentPermit.createdBy)));
        issuerRegion = (issuerRows[0]?.region || '') as string;
      } catch {}

      // Vérifier les droits: admin, l'agent qui a suspendu, ou l'agent régional de la même région que l'émetteur
      const isAdmin = role === 'admin';
      const isSuspender = suspenderId !== null && Number(userId) === Number(suspenderId);
      const isRegionalOfIssuer = role === 'agent' && issuerRegion && region && issuerRegion.toLowerCase() === region.toLowerCase();

      if (!(isAdmin || isSuspender || isRegionalOfIssuer)) {
        return res.status(403).json({
          message: "Réactivation refusée: seuls l'administrateur, l'agent ayant suspendu, ou l'agent régional de l'émetteur peuvent réactiver ce permis."
        });
      }
    } else {
      // Cas suspension: conserver la logique existante (admin illimité, sinon émetteur ou hiérarchie régionale)
      if (role !== 'admin') {
        let allowedUserIds: number[] = [userId];
        if (role === 'agent') {
          const subAgents = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
          const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
          allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
        }
        if (!allowedUserIds.includes(Number(currentPermit.createdBy))) {
          return res.status(403).json({ message: "Accès refusé: vous ne pouvez suspendre que les permis que vous (ou vos agents de secteur) avez délivrés" });
        }
      }
    }

    const newStatus = isReactivation ? 'active' : 'suspended';

    await db.update(permits)
      .set({ status: newStatus })
      .where(eq(permits.id, permitId));

    // Si suspension: dissocier automatiquement toute association guide-chasseur active pour ce chasseur
    if (newStatus === 'suspended') {
      try {
        const hunterIdForPermit = Number((currentPermit as any)?.hunterId ?? (currentPermit as any)?.hunter_id);
        if (Number.isFinite(hunterIdForPermit)) {
          await db.execute(sql.raw(`
            UPDATE guide_hunter_associations
            SET is_active = false, dissociated_at = NOW()
            WHERE hunter_id = ${hunterIdForPermit} AND is_active = true
          `));
        }
      } catch (e) {
        console.warn('[PATCH /api/permits/:id/suspend] Échec de la dissociation automatique guide-chasseur:', e);
      }
    }

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: newStatus === 'suspended' ? 'suspend' : 'reactivate',
      entityType: 'permit',
      entityId: permitId, // Correction: permitId est déjà un nombre
      details: `Permis ${currentPermit.permitNumber || 'ID ' + permitId} ${newStatus === 'suspended' ? 'suspendu' : 'réactivé'}`,
    });

    res.json({ message: `Permis ${newStatus === 'suspended' ? 'suspendu' : 'réactivé'}`, status: newStatus });
  } catch (error) {
    console.error("Erreur lors de la suspension du permis:", error);
    res.status(500).json({ message: "Échec de la suspension du permis" });
  }
});

// Supprimer un permis
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const permitId = parseInt(id, 10);

    if (isNaN(permitId)) {
      return res.status(400).json({ message: "ID de permis invalide" });
    }

    // Vérifier si le permis existe
    const existingPermit = await db.query.permits.findFirst({
      where: eq(permits.id, permitId)
    });

    if (!existingPermit) {
      return res.status(404).json({ message: "Permis non trouvé" });
    }

    // Autorisations: admin illimité, sinon l'utilisateur doit être l'émetteur (ou sub-agent de l'agent)
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);
    if (role !== 'admin') {
      let allowedUserIds: number[] = [userId];
      if (role === 'agent') {
        const subAgents = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
        const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
        allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
      }

      // Autoriser aussi les agents régionaux à supprimer les permis émis dans leur région
      let sameRegionAsIssuer = false;
      if (role === 'agent') {
        try {
          const issuerRows = await db
            .select({ region: users.region })
            .from(users)
            .where(eq(users.id, Number((existingPermit as any).createdBy)))
            .limit(1);
          const issuerRegion = (issuerRows[0]?.region || '') as string;
          if (issuerRegion && region && issuerRegion.toLowerCase() === region.toLowerCase()) {
            sameRegionAsIssuer = true;
          }
        } catch {}
      }

      const isIssuerOrSubAgent = allowedUserIds.includes(Number((existingPermit as any).createdBy));
      if (!(isIssuerOrSubAgent || sameRegionAsIssuer)) {
        return res.status(403).json({ message: "Accès refusé: vous ne pouvez supprimer que les permis émis par vous, vos subalternes, ou dans votre région." });
      }
    }

    // Supprimer d'abord toutes les taxes associées à ce permis (suppression en cascade logique)
    try {
      const deletedTaxes = await db
        .delete(taxes)
        .where(eq(taxes.permitId, permitId))
        .returning({ id: taxes.id, taxNumber: taxes.taxNumber });
      if (Array.isArray(deletedTaxes) && deletedTaxes.length > 0) {
        for (const t of deletedTaxes) {
          try {
            await storage.createHistory({
              userId: Number(req.user?.id || 0),
              operation: 'delete',
              entityType: 'tax',
              entityId: Number((t as any).id),
              details: `Taxe ${((t as any).taxNumber) || ''} supprimée suite à suppression du permis ${existingPermit.permitNumber}`,
            });
          } catch {}
        }
      }
    } catch (e) {
      // En cas d'échec de cascade, on continue la suppression du permis pour éviter des incohérences
      console.warn('[PERMITS DELETE] Échec suppression en cascade des taxes pour permitId=', permitId, e);
    }

    // Supprimer le permis
    await db.delete(permits)
      .where(eq(permits.id, permitId));

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: 'delete',
      entityType: 'permit',
      entityId: permitId,
      details: `Permis ${existingPermit.permitNumber} supprimé`,
    });

    res.json({
      message: "Permis supprimé avec succès",
      permitId: permitId
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du permis:', error);
    res.status(500).json({
      message: 'Erreur lors de la suppression du permis',
      error: (error as any)?.message ?? 'Unknown error'
    });
  }
});

// Récupérer les permis par région
router.get('/region/:region', isAuthenticated, async (req, res) => {
  try {
    const { region } = req.params;
    const regionId = parseInt(region, 10);
    if (isNaN(regionId)) {
      return res.status(400).json({ message: "ID de région invalide" });
    }

    // Récupérer les permis pour la région spécifiée
    const regionPermits = await db.query.permits.findMany({
      with: {
        hunter: {
          where: eq(hunters.region, region)
        }
      },
      where: sql`${permits.hunterId} IN (
        SELECT id FROM hunters WHERE region = ${region}
      )`
    });

    res.json(regionPermits);
  } catch (error) {
    console.error(`Erreur lors de la récupération des permis pour la région ${req.params.region}:`, error);
    res.status(500).json({
      message: `Erreur lors de la récupération des permis pour la région ${req.params.region}`
    });
  }
});



// Récupérer tous les permis suspendus
router.get('/suspended', isAuthenticated, async (req, res) => {
  try {
    const suspendedPermits = await db.query.permits.findMany({
      where: eq(permits.status, 'suspended'),
      with: {
        hunter: true
      }
    });
    res.json(suspendedPermits);
  } catch (error) {
    console.error('Erreur lors de la récupération des permis suspendus:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des permis suspendus' });
  }
});

// Supprimer tous les permis suspendus
router.delete('/suspended/all', isAuthenticated, async (req, res) => {
  try {
    // Récupérer d'abord les IDs des permis à supprimer pour l'historique
    const permitsToDelete = await db.query.permits.findMany({
      where: eq(permits.status, 'suspended'),
      columns: { id: true, permitNumber: true }
    });

    // Supprimer les permis
    const result = await db.delete(permits)
      .where(eq(permits.status, 'suspended'))
      .returning({ id: permits.id });

    // Ajouter une entrée d'historique pour la suppression groupée
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: 'delete_all',
      entityType: 'permit',
      entityId: 0,
      details: `${result.length} permis suspendus supprimés`,
    });

    res.json({
      message: `${result.length} permis suspendus ont été supprimés`,
      count: result.length
    });
  } catch (error) {
    console.error('Erreur lors de la suppression des permis suspendus:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression des permis suspendus' });
  }
});

// Supprimer un lot de permis par leurs IDs
router.post('/batch/delete', isAuthenticated, async (req, res) => {
  try {
    const { permitIds } = req.body;

    if (!Array.isArray(permitIds) || permitIds.length === 0) {
      return res.status(400).json({ message: 'Liste d\'IDs de permis invalide' });
    }

    // Vérifier que tous les IDs sont des nombres valides
    const ids = permitIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (ids.length !== permitIds.length) {
      return res.status(400).json({ message: 'Un ou plusieurs IDs de permis sont invalides' });
    }

    // Supprimer les permis
    const result = await db.delete(permits)
      .where(sql`${permits.id} IN ${ids}`)
      .returning({ id: permits.id });

    // Ajouter une entrée d'historique pour la suppression groupée
    await storage.createHistory({
      userId: Number(req.user?.id || 0),
      operation: 'batch_delete',
      entityType: 'permit',
      entityId: 0,
      details: `${result.length} permis supprimés en lot`,
    });

    res.json({
      message: `${result.length} permis ont été supprimés`,
      count: result.length
    });
  } catch (error) {
    console.error('Erreur lors de la suppression des permis:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression des permis' });
  }
});

// Détail d'un permis (avec infos émetteur et chasseur)
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);
    const permitId = Number(req.params.id);

    if (Number.isNaN(permitId)) {
      return res.status(400).json({ message: 'ID de permis invalide.' });
    }

    // Utiliser uniquement le département du chasseur
    if (role === 'admin') {
      const result: any[] = await db.execute(sql.raw(`
        SELECT
          p.id,
          p.permit_number AS "permitNumber",
          p.hunter_id AS "hunterId",
          p.issue_date AS "issueDate",
          p.expiry_date AS "expiryDate",
          p.validity_days AS "validityDays",
          p.status,
          p.price,
          p.type,
          p.category_id AS "categoryId",
          p.receipt_number AS "receiptNumber",
          p.area,
          p.weapons,
          p.metadata,
          p.created_at AS "createdAt",
          p.created_by AS "createdBy",
          u.id AS "issuerId",
          u.role AS "issuerRole",
          u.region AS "issuerRegion",
          u.departement AS "issuerDepartement",
          u.username AS "issuerUsername",
          u.first_name AS "issuerFirstName",
          u.last_name AS "issuerLastName",
          h.first_name AS "hunterFirstName",
          h.last_name AS "hunterLastName",
          h.id_number AS "hunterIdNumber",
          h.region AS "hunterRegion",
          h.departement AS "hunterDepartement"
        FROM permits p
        LEFT JOIN hunters h ON p.hunter_id = h.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.id = ${permitId}
        LIMIT 1
      `));
      if (!result.length) return res.status(404).json({ message: 'Permis non trouvé' });
      // Recalcul dynamique (Option A)
      try {
        const p = result[0] as any;
        const auto = await computeValidityAndExpiry({
          issueDate: p.issueDate ? new Date(p.issueDate) : new Date(),
          categoryId: p.categoryId || undefined,
        });
        if (auto) return res.json({ ...p, computedEffectiveValidityDays: auto.validityDays, computedEffectiveExpiry: auto.expiryDate });
      } catch {}
      return res.json(result[0]);
    }

    // Feature flag: autoriser les agents à voir tous les permis, même s'ils ne les ont pas émis
    let agentPermitAccessEnabled = false;
    try {
      const rows: any[] = await db.select().from(settings).where(eq(settings.key, 'agent_permit_access')).limit(1);
      if (rows && rows.length > 0) {
        const raw = (rows[0] as any).value as any;
        if (typeof raw === 'string') {
          try {
            if (raw === 'true' || raw === 'false') agentPermitAccessEnabled = (raw === 'true');
            else agentPermitAccessEnabled = !!JSON.parse(raw)?.enabled;
          } catch { agentPermitAccessEnabled = raw === 'true'; }
        } else if (raw && typeof raw === 'object') {
          agentPermitAccessEnabled = !!(raw as any).enabled;
        }
      }
    } catch {}
    const roleLc = (role || '').toLowerCase();
    const isAgentLike = roleLc.includes('agent'); // couvre 'agent', 'sub-agent', 'agent-secteur', etc.
    console.log(`[PERMITS DEBUG] GET /api/permits/${permitId} role=${role} flag.agent_permit_access=${agentPermitAccessEnabled}`);

    // Si le flag est actif et que l'utilisateur est agent-like, autoriser l'accès global (comme admin)
    if (agentPermitAccessEnabled && isAgentLike) {
      const resultAny: any[] = await db.execute(sql.raw(`
        SELECT
          p.id,
          p.permit_number AS "permitNumber",
          p.hunter_id AS "hunterId",
          p.issue_date AS "issueDate",
          p.expiry_date AS "expiryDate",
          p.validity_days AS "validityDays",
          p.status,
          p.price,
          p.type,
          p.category_id AS "categoryId",
          p.receipt_number AS "receiptNumber",
          p.area,
          p.weapons,
          p.metadata,
          p.created_at AS "createdAt",
          p.created_by AS "createdBy",
          u.id AS "issuerId",
          u.role AS "issuerRole",
          u.region AS "issuerRegion",
          u.departement AS "issuerDepartement",
          u.username AS "issuerUsername",
          u.first_name AS "issuerFirstName",
          u.last_name AS "issuerLastName",
          h.first_name AS "hunterFirstName",
          h.last_name AS "hunterLastName",
          h.id_number AS "hunterIdNumber",
          h.region AS "hunterRegion",
          h.departement AS "hunterDepartement"
        FROM permits p
        LEFT JOIN hunters h ON p.hunter_id = h.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.id = ${permitId}
        LIMIT 1
      `));
      if (!resultAny.length) return res.status(404).json({ message: 'Permis non trouvé' });
      console.log(`[PERMITS DEBUG] Access granted via feature flag for role=${role} permitId=${permitId}`);
      // Recalcul dynamique (Option A)
      try {
        const p = resultAny[0] as any;
        const auto = await computeValidityAndExpiry({
          issueDate: p.issueDate ? new Date(p.issueDate) : new Date(),
          categoryId: p.categoryId || undefined,
        });
        if (auto) return res.json({ ...p, computedEffectiveValidityDays: auto.validityDays, computedEffectiveExpiry: auto.expiryDate });
      } catch {}
      return res.json(resultAny[0]);
    }

    // Calcul des userIds autorisés pour agent / sub-agent (comportement par défaut)
    let allowedUserIds: number[] = [userId];
    if (role === 'agent') {
      const subAgents = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
      const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
      allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
    }

    const result2: any[] = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.permit_number AS "permitNumber",
        p.hunter_id AS "hunterId",
        p.issue_date AS "issueDate",
        p.expiry_date AS "expiryDate",
        p.status,
        p.price,
        p.type,
        p.category_id AS "categoryId",
        p.receipt_number AS "receiptNumber",
        p.area,
        p.weapons,
        p.metadata,
        p.created_at AS "createdAt",
        p.created_by AS "createdBy",
        u.id AS "issuerId",
        u.role AS "issuerRole",
        u.region AS "issuerRegion",
        u.departement AS "issuerDepartement",
        u.username AS "issuerUsername",
        u.first_name AS "issuerFirstName",
        u.last_name AS "issuerLastName",
        h.first_name AS "hunterFirstName",
        h.last_name AS "hunterLastName",
        h.id_number AS "hunterIdNumber",
        h.region AS "hunterRegion",
        h.departement AS "hunterDepartement"
      FROM permits p
      LEFT JOIN hunters h ON p.hunter_id = h.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ${permitId} AND p.created_by = ANY('{${allowedUserIds.join(',')}}'::int[])
      LIMIT 1
    `));

    if (!result2.length) return res.status(404).json({ message: 'Permis non trouvé ou accès refusé' });
    // Recalcul dynamique (Option A)
    try {
      const p = result2[0] as any;
      const auto = await computeValidityAndExpiry({
        issueDate: p.issueDate ? new Date(p.issueDate) : new Date(),
        categoryId: p.categoryId || undefined,
      });
      if (auto) return res.json({ ...p, computedEffectiveValidityDays: auto.validityDays, computedEffectiveExpiry: auto.expiryDate });
    } catch {}
    return res.json(result2[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération du détail du permis:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Synchroniser les statuts des permis selon leur date d'expiration
router.post('/sync-status', isAuthenticated, async (req, res) => {
  try {
    console.log('[PERMITS] Synchronisation des statuts de permis...');

    // Récupérer tous les permis avec leur statut actuel et date d'expiration
    const permitsToUpdate = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.permit_number AS "permitNumber",
        p.status AS currentStatus,
        p.expiry_date AS "expiryDate",
        p.metadata,
        EXTRACT(EPOCH FROM (p.expiry_date - CURRENT_DATE)) / 86400 AS daysUntilExpiry
      FROM permits p
      WHERE p.status IN ('active', 'expired', 'suspended')
      ORDER BY p.id
    `));

    let updatedCount = 0;
    const updates = [];

    for (const permit of permitsToUpdate) {
      // Vérification de type pour éviter les erreurs TypeScript
      if (!permit || typeof permit !== 'object') continue;

      const permitData = permit as any;
      const expiryDateRaw = permitData.expiryDate;
      const permitNumber = permitData.permitNumber;
      const currentStatus = permitData.currentStatus;
      const metadata = permitData.metadata;
      const daysUntilExpiryRaw = permitData.daysUntilExpiry;

      if (!expiryDateRaw || !permitNumber || !currentStatus) continue;

      const expiryDate = new Date(expiryDateRaw);
      const now = new Date();
      const isExpired = expiryDate <= now;
      const daysUntilExpiry = Math.floor(daysUntilExpiryRaw || 0);

      let newStatus = currentStatus;

      // Logique de calcul du statut basé sur la date d'expiration
      if (isExpired && currentStatus === 'active') {
        newStatus = 'expired';
        console.log(`[PERMITS] Permis ${permitNumber} marqué comme expiré (date: ${expiryDateRaw})`);
      } else if (!isExpired && currentStatus === 'expired') {
        newStatus = 'active';
        console.log(`[PERMITS] Permis ${permitNumber} réactivé (date: ${expiryDateRaw})`);
      }

      // Calculer si le permis est épuisé (renouvellements >= 2 ET expiré)
      let isExhausted = false;
      if (newStatus === 'expired') {
        try {
          const metadataObj = typeof metadata === 'string'
            ? JSON.parse(metadata)
            : metadata;

          const renewalCount = metadataObj?.renewalCount ||
                              metadataObj?.renewals?.length ||
                              0;

          isExhausted = renewalCount >= 2;
        } catch (e) {
          console.warn(`[PERMITS] Erreur parsing metadata pour permis ${permitNumber}:`, e);
        }
      }

      // Mettre à jour le statut si nécessaire
      if (newStatus !== currentStatus) {
        updates.push({
          id: permitData.id,
          oldStatus: currentStatus,
          newStatus,
          permitNumber,
          isExhausted
        });
      }
    }

    // Appliquer les mises à jour
    for (const update of updates) {
      if (!update.id || typeof update.id !== 'number') continue;

      await db.execute(sql.raw(`
        UPDATE permits
        SET status = '${update.newStatus}'
        WHERE id = ${update.id}
      `));

      // Créer une entrée d'historique
      await storage.createHistory({
        userId: Number((req as any)?.user?.id || 0),
        operation: "update",
        entityType: "permit",
        entityId: update.id,
        details: `Statut synchronisé: ${update.oldStatus} → ${update.newStatus} (permis ${update.permitNumber})`
      });

      updatedCount++;
    }

    console.log(`[PERMITS] Synchronisation terminée: ${updatedCount} permis mis à jour`);

    res.json({
      success: true,
      updatedCount,
      details: updates
    });

  } catch (error) {
    console.error('Erreur lors de la synchronisation des statuts:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation des statuts'
    });
  }
});

// ...

export default router;




