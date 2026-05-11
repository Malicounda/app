import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { taxes, hunters, permits, users } from '../../shared/dist/schema.js';
import { and, desc, eq, inArray, or, isNull, sql } from 'drizzle-orm';

const router = Router();

// Fonction pour générer un numéro de taxe unique
async function generateUniqueTaxNumber() {
  const year = new Date().getFullYear();
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    // Générer 4 chiffres aléatoires
    const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    // Générer une lettre aléatoire A-Z
    const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    
    const taxNumber = `T-SN-${year}-${randomDigits}${randomLetter}`;
    
    // Vérifier si ce numéro existe déjà (Drizzle)
    const existingTax = await db
      .select({ id: taxes.id })
      .from(taxes)
      .where(eq(taxes.taxNumber, taxNumber));
    if (existingTax.length === 0) return taxNumber;
    
    attempts++;
  }
  
  throw new Error('Impossible de générer un numéro de taxe unique après 100 tentatives');
}

// GET /api/taxes -> liste des taxes
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const role = currentUser?.role;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);
    const permitNumber = req.query.permitNumber as string | undefined;

    if (role === 'admin') {
      let query = db
        .select({
          id: taxes.id,
          taxNumber: taxes.taxNumber,
          hunterId: taxes.hunterId,
          permitId: taxes.permitId,
          issueDate: taxes.issueDate,
          animalType: taxes.animalType,
          quantity: taxes.quantity,
          receiptNumber: taxes.receiptNumber,
          amount: taxes.amount,
          createdAt: taxes.createdAt,
          createdBy: taxes.createdBy,
          // Issuer info
          issuerId: users.id,
          issuerRole: users.role,
          issuerRegion: users.region,
          issuerDepartement: users.departement,
          issuerUsername: users.username,
          issuerFirstName: users.firstName,
          issuerLastName: users.lastName,
          // Informations du chasseur
          hunterFirstName: hunters.firstName,
          hunterLastName: hunters.lastName,
          hunterIdNumber: hunters.idNumber,
          // Informations du permis
          permitNumber: permits.permitNumber,
          permitType: permits.type,
          permitStatus: permits.status
        })
        .from(taxes)
        .leftJoin(hunters, eq(taxes.hunterId, hunters.id))
        .leftJoin(permits, eq(taxes.permitId, permits.id))
        .leftJoin(users, eq(taxes.createdBy, users.id));
      
      if (permitNumber) {
        query = query.where(eq(permits.permitNumber, permitNumber)) as any;
      }
      
      const result = await query.orderBy(desc(taxes.createdAt));
      return res.json(result);
    }
    // Agents: visibilité par émetteur (createdBy)
    let allowedUserIds: number[] = [userId];
    if (role === 'agent') {
      const subAgents = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'sub-agent'), eq(users.region, region)));
      const subAgentIds = subAgents.map(u => u.id).filter(Boolean) as number[];
      allowedUserIds = Array.from(new Set([userId, ...subAgentIds]));
    }

    let scopedQuery = db
      .select({
        id: taxes.id,
        taxNumber: taxes.taxNumber,
        hunterId: taxes.hunterId,
        permitId: taxes.permitId,
        issueDate: taxes.issueDate,
        animalType: taxes.animalType,
        quantity: taxes.quantity,
        receiptNumber: taxes.receiptNumber,
        amount: taxes.amount,
        createdAt: taxes.createdAt,
        createdBy: taxes.createdBy,
        // Issuer info
        issuerId: users.id,
        issuerRole: users.role,
        issuerRegion: users.region,
        issuerDepartement: users.departement,
        issuerUsername: users.username,
        issuerFirstName: users.firstName,
        issuerLastName: users.lastName,
        // Informations du chasseur
        hunterFirstName: hunters.firstName,
        hunterLastName: hunters.lastName,
        hunterIdNumber: hunters.idNumber,
        // Informations du permis
        permitNumber: permits.permitNumber,
        permitType: permits.type,
        permitStatus: permits.status
      })
      .from(taxes)
      .leftJoin(hunters, eq(taxes.hunterId, hunters.id))
      .leftJoin(permits, eq(taxes.permitId, permits.id))
      .leftJoin(users, eq(taxes.createdBy, users.id));
    
    if (permitNumber) {
      // Ne pas restreindre par createdBy lorsque l'on filtre par permitNumber
      scopedQuery = scopedQuery.where(eq(permits.permitNumber, permitNumber)) as any;
    } else {
      scopedQuery = scopedQuery.where(inArray(taxes.createdBy, allowedUserIds)) as any;
    }
    
    const scoped = await scopedQuery.orderBy(desc(taxes.createdAt));
    return res.json(scoped);
  } catch (err) {
    console.error('Erreur GET /api/taxes:', err);
    return res.status(500).json({ message: "Impossible de charger les taxes" });
  }
});

// GET /api/taxes/hunter/:hunterId -> taxes d'un chasseur
router.get('/hunter/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const { hunterId } = req.params;
    const hunterIdNum = Number(hunterId);
    if (!hunterId || Number.isNaN(hunterIdNum)) {
      return res.status(400).json({ message: "Paramètre hunterId invalide" });
    }
    const result = await db
      .select()
      .from(taxes)
      .where(eq(taxes.hunterId, hunterIdNum))
      .orderBy(desc(taxes.createdAt));
    return res.json(result);
  } catch (err) {
    console.error('Erreur GET /api/taxes/hunter/:hunterId:', err);
    return res.status(500).json({ message: "Impossible de charger les taxes du chasseur" });
  }
});

// GET /api/taxes/permit/:permitId -> taxes liées à un permis
router.get('/permit/:permitId', isAuthenticated, async (req, res) => {
  try {
    const { permitId } = req.params;
    const permitIdNum = Number(permitId);
    if (!permitId || Number.isNaN(permitIdNum)) {
      return res.status(400).json({ message: "Paramètre permitId invalide" });
    }
    const result = await db
      .select({
        id: taxes.id,
        taxNumber: taxes.taxNumber,
        hunterId: taxes.hunterId,
        permitId: taxes.permitId,
        issueDate: taxes.issueDate,
        animalType: taxes.animalType,
        quantity: taxes.quantity,
        receiptNumber: taxes.receiptNumber,
        amount: taxes.amount,
        createdAt: taxes.createdAt,
        createdBy: taxes.createdBy,
        issuerId: users.id,
        issuerRole: users.role,
        issuerRegion: users.region,
        issuerDepartement: users.departement,
        issuerUsername: users.username,
        issuerFirstName: users.firstName,
        issuerLastName: users.lastName,
      })
      .from(taxes)
      .leftJoin(users, eq(taxes.createdBy, users.id))
      .where(eq(taxes.permitId, permitIdNum))
      .orderBy(desc(taxes.createdAt));
    return res.json(result);
  } catch (err) {
    console.error('Erreur GET /api/taxes/permit/:permitId:', err);
    return res.status(500).json({ message: "Impossible de charger les taxes du permis" });
  }
});

// GET /api/taxes/:id -> détail d'une taxe
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }
    const result = await db
      .select({
        id: taxes.id,
        taxNumber: taxes.taxNumber,
        hunterId: taxes.hunterId,
        permitId: taxes.permitId,
        issueDate: taxes.issueDate,
        animalType: taxes.animalType,
        quantity: taxes.quantity,
        receiptNumber: taxes.receiptNumber,
        amount: taxes.amount,
        createdAt: taxes.createdAt,
        createdBy: taxes.createdBy,
        issuerId: users.id,
        issuerRole: users.role,
        issuerRegion: users.region,
        issuerDepartement: users.departement,
        issuerUsername: users.username,
        issuerFirstName: users.firstName,
        issuerLastName: users.lastName,
      })
      .from(taxes)
      .leftJoin(users, eq(taxes.createdBy, users.id))
      .where(eq(taxes.id, idNum));
    if (result.length === 0) {
      return res.status(404).json({ message: "Taxe introuvable" });
    }
    return res.json(result[0]);
  } catch (err) {
    console.error('Erreur GET /api/taxes/:id:', err);
    return res.status(500).json({ message: "Impossible de charger la taxe" });
  }
});

// POST /api/taxes -> créer une nouvelle taxe
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const {
      hunterId,
      permitId,
      amount,
      issueDate,
      animalType,
      quantity,
      receiptNumber
    } = req.body as {
      hunterId: number | string;
      permitId?: number | string;
      amount: number | string;
      issueDate?: string;
      animalType: string;
      quantity: number | string;
      receiptNumber: string;
    };

    // Validation des données requises
    if (!hunterId || !amount || !animalType || !quantity || !receiptNumber) {
      return res.status(400).json({
        message: "Données manquantes: hunterId, amount, animalType, quantity, receiptNumber sont requis"
      });
    }

    // Récupérer l'utilisateur courant et son scope
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const userRegion = String(currentUser?.region || '');
    const userDepartement = String((currentUser as any)?.departement || (currentUser as any)?.zone || '');

    // Lire le feature flag agent_permit_access
    let agentPermitAccessEnabled = false;
    try {
      const rows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'agent_permit_access' LIMIT 1`);
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

    // Vérifier le scope région/zone du chasseur ciblé
    console.debug('[TAXES] Step A: fetching hunter scope');
    const hunterRow = await db
      .select({ region: hunters.region, departement: (hunters as any).departement })
      .from(hunters)
      .where(eq(hunters.id, Number(hunterId)))
      .limit(1);
    if (!hunterRow.length) {
      return res.status(400).json({ message: "Chasseur introuvable" });
    }
    const hunterRegion = String((hunterRow[0] as any).region || '');
    const hunterDepartement = String((hunterRow[0] as any).departement || '');

    // Lire le flag d'override national
    let nationalOverride = false;
    try {
      const flagRows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'national_agent_override' LIMIT 1`);
      if (flagRows && flagRows.length > 0) {
        const raw = (flagRows[0] as any).value;
        if (typeof raw === 'string') {
          try {
            if (raw === 'true' || raw === 'false') nationalOverride = raw === 'true';
            else nationalOverride = !!JSON.parse(raw)?.enabled;
          } catch { nationalOverride = raw === 'true'; }
        } else if (typeof raw === 'object' && raw !== null) {
          nationalOverride = !!raw.enabled;
        }
      }
    } catch (_) {
      // défaut false
    }

    // Si le flag n'est PAS activé, appliquer les règles classiques (sauf si l'utilisateur est le renouvelant autorisé)
    // Autoriser les agents/sub-agents qui ont RENOUVELÉ le permis (quand agent_permit_access est actif)
    let allowByRenewal = false;
    try {
      const permitIdForAuth = (req.body as any)?.permitId;
      const permitIdNum = permitIdForAuth ? Number(permitIdForAuth) : NaN;
      if (
        agentPermitAccessEnabled &&
        (role === 'agent' || role === 'sub-agent') &&
        Number.isFinite(permitIdNum)
      ) {
        const prow = await db
          .select({ metadata: permits.metadata as any })
          .from(permits)
          .where(eq(permits.id, permitIdNum))
          .limit(1);
        if (prow.length) {
          let meta: any = prow[0].metadata;
          try { if (typeof meta === 'string') meta = JSON.parse(meta); } catch {}
          if (meta && Array.isArray(meta.renewals)) {
            const uid = Number((currentUser as any)?.id || 0);
            allowByRenewal = meta.renewals.some((r: any) => Number(r?.by?.id) === uid);
          }
        }
      }
    } catch {}

    if (!nationalOverride && role !== 'admin' && !allowByRenewal) {
      if (role === 'agent') {
        if (userRegion && hunterRegion && userRegion.toLowerCase() !== hunterRegion.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé: un agent régional ne peut créer une taxe que pour les chasseurs de sa région (activez l'override national pour autoriser)." });
        }
      } else if (role === 'sub-agent') {
        if (userDepartement && hunterDepartement && userDepartement.toLowerCase() !== hunterDepartement.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé: un agent de secteur ne peut créer une taxe que pour les chasseurs de son département (activez l'override national pour autoriser)." });
        }
      }
    }

    // Valider / normaliser le numéro de quittance et vérifier unicité (taxes + permits)
    try {
      if (receiptNumber && String(receiptNumber).trim()) {
        let raw = String(receiptNumber).toUpperCase().trim();
        if (/PLACEDOR/i.test(raw)) {
          return res.status(400).json({ message: 'numéro invalide' });
        }
        // Accepter variantes: 1234567/22JS | 1234567/22 JS | 1234567/22.JS
        const m = raw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
        if (!m) {
          return res.status(400).json({ message: "Numéro invalide (ex: 1234567/22 JS)" });
        }
        const normalized = `${m[1]}/${m[2]} ${m[3]}`;
        // Unicité dans taxes
        const dupTax = await db.execute(sql.raw(`SELECT 1 FROM taxes WHERE receipt_number = '${normalized.replace(/'/g, "''")}' LIMIT 1`));
        if (Array.isArray(dupTax) && dupTax.length > 0) {
          return res.status(409).json({ message: "N° de quittance déjà utilisé (taxe)." });
        }
        // Unicité dans permits
        const dupPermit = await db.execute(sql.raw(`SELECT 1 FROM permits WHERE receipt_number = '${normalized.replace(/'/g, "''")}' LIMIT 1`));
        if (Array.isArray(dupPermit) && dupPermit.length > 0) {
          return res.status(409).json({ message: "N° de quittance déjà utilisé (permis)." });
        }
        // Remplacer par la valeur normalisée
        (req.body as any).receiptNumber = normalized;
      }
    } catch (_) { /* ignore: DB constraints may also enforce */ }

    // Générer un numéro de taxe unique
    console.debug('[TAXES] Step B: generating taxNumber');
    const taxNumber = await generateUniqueTaxNumber();

    // Normaliser permitId: préférer null (colonne nullable) plutôt que undefined
    const normalizedPermitId = (permitId !== undefined && permitId !== null && `${permitId}`.trim() !== '')
      ? Number(permitId)
      : null;

    // Si un permitId est fourni, vérifier les règles métier d'éligibilité
    if (normalizedPermitId) {
      try {
        const prow = await db
          .select({ 
            id: permits.id, 
            type: permits.type, 
            categoryId: permits.categoryId, 
            permitNumber: permits.permitNumber, 
            hunterId: permits.hunterId, 
            createdBy: permits.createdBy,
            status: permits.status,
            expiryDate: permits.expiryDate,
            metadata: permits.metadata as any
          })
          .from(permits)
          .where(eq(permits.id, normalizedPermitId))
          .limit(1);
        if (!prow.length) {
          return res.status(400).json({ message: "Permis introuvable pour l'association de la taxe" });
        }
        const p = prow[0] as any;
        // Règles générales: le permis doit être actif
        // Et précision sur le renouvellement: on refuse seulement si le permis a été RENOUVELÉ ET que sa date d'expiration est atteinte
        const pStatus = String(p.status || '').toLowerCase();
        const exp = p.expiryDate ? new Date(p.expiryDate) : null;
        const expired = !!exp && exp < new Date();
        let renewalCount = 0;
        try {
          let meta = p.metadata;
          if (typeof meta === 'string') meta = JSON.parse(meta);
          if (meta && Array.isArray(meta.renewals)) renewalCount = meta.renewals.length;
          else if (meta && typeof meta.renewalCount === 'number') renewalCount = meta.renewalCount;
        } catch {}
        // Non actif => refus
        if (pStatus !== 'active') {
          return res.status(409).json({ message: "Taxe refusée: le permis n'est pas actif." });
        }
        // Nouvelle règle de précision: refuser uniquement si renouvelé (>=1) ET expiré
        if (renewalCount >= 1 && expired) {
          return res.status(409).json({ message: "Taxe refusée: le permis renouvelé a atteint sa date d'expiration." });
        }
        const pType = String(p.type || '').toLowerCase();
        const pCat = String(p.categoryId || '').toLowerCase();
        const isWaterfowl = pType === 'gibier-eau' || pCat.includes('gibier-eau');
        if (isWaterfowl) {
          return res.status(409).json({ message: "Les permis de Gibier d'Eau ne sont pas éligibles aux taxes d'abattage." });
        }
        const isPetiteChasse = pType === 'petite-chasse' || pCat.includes('petite-chasse');
        if (isPetiteChasse) {
          const a = String(animalType || '').toLowerCase();
          // Autoriser uniquement les variantes de phacochère
          const isPhacochere = a.includes('phacoch') || a.includes('phacochère') || a.includes('phaco');
          if (!isPhacochere) {
            return res.status(409).json({ message: "Pour les permis de Petite Chasse, seules les taxes de Phacochère sont autorisées." });
          }
        }
      } catch (e) {
        // En cas d'erreur DB, sécuriser en bloquant pour éviter des incohérences
        return res.status(500).json({ message: "Échec de la vérification d'éligibilité du permis pour la taxe" });
      }
    }

    // Préparer les données pour l'insertion
    // Construire les snapshots immuables si un permitId est associé
    let permitNumberSnapshot: string | null = null;
    let permitCategorySnapshot: string | null = null;
    let hunterNameSnapshot: string | null = null;
    let issuerServiceSnapshot: string | null = null;

    if (normalizedPermitId) {
      try {
        // Récupérer info permis + chasseur + émetteur pour snapshots
        const rows = await db
          .select({
            permitNumber: permits.permitNumber,
            categoryId: permits.categoryId,
            hunterFirstName: hunters.firstName,
            hunterLastName: hunters.lastName,
            issuerRegion: users.region,
            issuerDepartement: users.departement,
          })
          .from(permits)
          .leftJoin(hunters, eq(permits.hunterId, hunters.id))
          .leftJoin(users, eq(permits.createdBy, users.id))
          .where(eq(permits.id, normalizedPermitId))
          .limit(1);
        if (rows.length) {
          const r: any = rows[0];
          permitNumberSnapshot = String(r.permitNumber || '') || null;
          permitCategorySnapshot = String(r.categoryId || '') || null;
          const ln = String(r.hunterLastName || '').trim();
          const fn = String(r.hunterFirstName || '').trim();
          hunterNameSnapshot = (ln || fn) ? `${ln.toUpperCase()} ${fn}`.trim() : null;
          const dep = typeof r.issuerDepartement === 'string' ? r.issuerDepartement : '';
          const reg = typeof r.issuerRegion === 'string' ? r.issuerRegion : '';
          if (dep) {
            issuerServiceSnapshot = `Service des Eaux et Forêts - Secteur/${dep.toUpperCase()}`;
          } else if (reg) {
            issuerServiceSnapshot = `Inspection Régionale des Eaux et Forêts - IREF/${reg.toUpperCase()}`;
          } else {
            issuerServiceSnapshot = 'Service des Eaux et Forêts';
          }
        }
      } catch (_) {
        // En cas d'échec snapshot, continuer sans bloquer l'insertion
      }
    }

    const valuesToInsert = {
      taxNumber,
      hunterId: Number(hunterId),
      permitId: normalizedPermitId,
      // Dans le schéma, amount est stocké en string (numeric)
      amount: String(typeof amount === 'string' ? parseFloat(amount) : amount),
      issueDate: issueDate || new Date().toISOString().split('T')[0],
      animalType,
      quantity: typeof quantity === 'string' ? parseInt(quantity, 10) : quantity,
      receiptNumber: (req.body as any)?.receiptNumber,
      createdBy: Number((req as any)?.user?.id || 0),
      // Snapshots immuables
      permitNumberSnapshot,
      permitCategorySnapshot,
      hunterNameSnapshot,
      issuerServiceSnapshot,
    } as const;

    console.debug('[TAXES] Step C: inserting tax');
    const inserted = await db
      .insert(taxes)
      .values(valuesToInsert)
      .returning({ id: taxes.id, taxNumber: taxes.taxNumber });
    const created = inserted[0];

    console.debug('[TAXES] Step D: insert completed');
    return res.status(201).json({
      message: "Taxe créée avec succès",
      tax: created
    });
  } catch (err: any) {
    console.error('Erreur POST /api/taxes:', err);
    const message = String(err?.message || err);
    if (message.includes('numéro de taxe unique') || message.includes('unique') || message.includes('duplicate')) {
      return res.status(500).json({ message: "Erreur lors de la génération du numéro de taxe" });
    }
    return res.status(500).json({ message: "Impossible de créer la taxe" });
  }
});

// PUT /api/taxes/:id -> mettre à jour une taxe
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }

    // Autorisations: admin illimité, sinon l'utilisateur doit être l'émetteur (ou sub-agent d'un agent de la région)
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    // Vérifier que la taxe existe et récupérer son émetteur
    const existingRow = await db
      .select({ id: taxes.id, createdBy: taxes.createdBy })
      .from(taxes)
      .where(eq(taxes.id, idNum));
    if (existingRow.length === 0) {
      return res.status(404).json({ message: "Taxe introuvable" });
    }
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
      if (!allowedUserIds.includes(Number(existingRow[0].createdBy))) {
        return res.status(403).json({ message: "Accès refusé: vous ne pouvez modifier que les taxes que vous (ou vos agents de secteur) avez créées" });
      }
    }

    const { amount, issueDate, animalType, quantity, receiptNumber, permitId } = req.body as {
      amount?: number | string;
      issueDate?: string;
      animalType?: string;
      quantity?: number | string;
      receiptNumber?: string;
      permitId?: number | string;
    };

    // Interdire toute tentative de modification de l'association permitId d'une taxe existante
    if (permitId !== undefined) {
      return res.status(400).json({ message: "Réaffectation de la taxe à un autre permis interdite" });
    }

    const updateValues: Partial<typeof taxes.$inferInsert> = {};
    if (amount !== undefined) updateValues.amount = String(typeof amount === 'string' ? parseFloat(amount) : amount);
    if (issueDate !== undefined) updateValues.issueDate = issueDate;
    if (animalType !== undefined) updateValues.animalType = animalType;
    if (quantity !== undefined) updateValues.quantity = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;
    if (receiptNumber !== undefined) {
      // Valider et normaliser receiptNumber, vérifier unicité cross-tables, exclure la ligne courante
      let raw = String(receiptNumber).toUpperCase().trim();
      if (/PLACEDOR/i.test(raw)) {
        return res.status(400).json({ message: 'numéro invalide' });
      }
      const m = raw.match(/^(\d{7})\/(\d{2})[ .]?([A-Z]{2})$/);
      if (!m) {
        return res.status(400).json({ message: "Numéro invalide (ex: 1234567/22 JS)" });
      }
      const normalized = `${m[1]}/${m[2]} ${m[3]}`;
      // Unicité taxes (exclure l'ID courant)
      const dupTax = await db.execute(sql.raw(`SELECT 1 FROM taxes WHERE receipt_number = '${normalized.replace(/'/g, "''")}' AND id <> ${idNum} LIMIT 1`));
      if (Array.isArray(dupTax) && dupTax.length > 0) {
        return res.status(409).json({ message: "N° de quittance déjà utilisé (taxe)." });
      }
      // Unicité permits
      const dupPermit = await db.execute(sql.raw(`SELECT 1 FROM permits WHERE receipt_number = '${normalized.replace(/'/g, "''")}' LIMIT 1`));
      if (Array.isArray(dupPermit) && dupPermit.length > 0) {
        return res.status(409).json({ message: "N° de quittance déjà utilisé (permis)." });
      }
      (updateValues as any).receiptNumber = normalized;
    }

    if (Object.keys(updateValues).length === 0) {
      return res.status(400).json({ message: "Aucune donnée à mettre à jour" });
    }

    await db.update(taxes).set(updateValues).where(eq(taxes.id, idNum));

    return res.json({ message: "Taxe mise à jour avec succès" });
  } catch (err) {
    console.error('Erreur PUT /api/taxes/:id:', err);
    return res.status(500).json({ message: "Impossible de mettre à jour la taxe" });
  }
});

// DELETE /api/taxes/:id -> supprimer une taxe
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);
    if (!id || Number.isNaN(idNum)) {
      return res.status(400).json({ message: "Paramètre id invalide" });
    }

    // Autorisations: admin illimité, sinon l'utilisateur doit être l'émetteur (ou sub-agent d'un agent de la région)
    const currentUser = req.user as any;
    const role = currentUser?.role as string;
    const region = String(currentUser?.region || '');
    const userId = Number(currentUser?.id);

    // Vérifier que la taxe existe et récupérer son émetteur
    const existing = await db
      .select({ id: taxes.id, createdBy: taxes.createdBy })
      .from(taxes)
      .where(eq(taxes.id, idNum));
    if (existing.length === 0) {
      return res.status(404).json({ message: "Taxe introuvable" });
    }
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
      if (!allowedUserIds.includes(Number(existing[0].createdBy))) {
        return res.status(403).json({ message: "Accès refusé: vous ne pouvez supprimer que les taxes que vous (ou vos agents de secteur) avez créées" });
      }
    }

    await db.delete(taxes).where(eq(taxes.id, idNum));
    return res.json({ message: "Taxe supprimée avec succès" });
  } catch (err) {
    console.error('Erreur DELETE /api/taxes/:id:', err);
    return res.status(500).json({ message: "Impossible de supprimer la taxe" });
  }
});

// GET /api/taxes/usage?permitNumber=...&speciesId=...
// Retourne { permitId, hunterId, speciesId, totalBought, totalUsed, available }
// Autorisation: 
// - admin/agent/sub-agent: autorisés
// - guide: uniquement s'il est associé au chasseur propriétaire du permis (guide_hunter_associations.is_active=true)
router.get('/usage', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const userId = Number(currentUser?.id || 0);
    const roleLc = String(currentUser?.role || '').toLowerCase();

    const permitNumber = String(req.query.permitNumber || '').trim();
    const speciesId = String(req.query.speciesId || '').trim();
    const speciesName = String(req.query.speciesName || '').trim();

    if (!permitNumber) {
      return res.status(400).json({ message: 'Paramètre permitNumber requis' });
    }
    if (!speciesId && !speciesName) {
      return res.status(400).json({ message: 'Paramètre speciesId ou speciesName requis' });
    }

    // Charger le permis (id + hunter)
    const prow: any[] = await db.execute(sql`
      SELECT id, hunter_id FROM permits WHERE permit_number = ${permitNumber} LIMIT 1
    ` as any);
    if (!Array.isArray(prow) || prow.length === 0) {
      return res.status(404).json({ message: 'Permis introuvable' });
    }
    const permitId = Number(prow[0].id);
    const permitHunterId = Number(prow[0].hunter_id);

    // Si guide: vérifier association active guide↔chasseur
    const isGuide = roleLc.includes('guide');
    if (isGuide) {
      // Récupérer hunting_guides.id depuis users.id
      let guideId: number | null = null;
      try {
        const gRows: any[] = await db.execute(sql`
          SELECT hg.id AS guide_id
          FROM hunting_guides hg
          WHERE hg.user_id = ${userId}
          LIMIT 1
        ` as any);
        guideId = (Array.isArray(gRows) && gRows[0] && gRows[0].guide_id) ? Number(gRows[0].guide_id) : null;
      } catch {}
      if (!guideId) {
        return res.status(403).json({ message: "Accès refusé: profil guide introuvable" });
      }
      const assocRows: any[] = await db.execute(sql`
        SELECT 1
        FROM guide_hunter_associations
        WHERE hunter_id = ${permitHunterId} AND guide_id = ${guideId} AND is_active = TRUE
        LIMIT 1
      ` as any);
      if (!Array.isArray(assocRows) || assocRows.length === 0) {
        return res.status(403).json({ message: "Accès refusé: vous n'êtes pas associé à ce chasseur" });
      }
    }

    // Taxes achetées pour ce permis
    const taxesRows: any[] = await db.execute(sql`
      SELECT animal_type, SUM(quantity) AS qty
      FROM taxes
      WHERE permit_id = ${permitId}
      GROUP BY animal_type
    ` as any);

    // Normalisation des noms pour faire correspondre animal_type et nom d'espèce
    const normalize = (s: string) => s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();
    const targetName = speciesName ? normalize(speciesName) : '';

    let totalBought = 0;
    for (const t of taxesRows) {
      const at = String(t.animal_type || '');
      if (targetName) {
        const match = normalize(at).includes(targetName) || targetName.includes(normalize(at));
        if (match) totalBought += Number(t.qty || 0);
      } else {
        // Si pas de speciesName, on ne peut pas matcher par nom; garder 0 et compter via speciesId uniquement côté used
      }
    }

    // Quantité déjà utilisée (déclarations + activités) pour cette espèce
    let totalUsed = 0;
    if (speciesId) {
      const usedRows: any[] = await db.execute(sql`
        SELECT COALESCE(quantity, 1) AS qty FROM declaration_especes WHERE permit_id = ${permitId} AND espece_id = ${speciesId}
        UNION ALL
        SELECT COALESCE(quantity, 1) AS qty FROM hunting_activities WHERE permit_id = ${permitId} AND species_id = ${speciesId}
      ` as any);
      for (const u of usedRows) totalUsed += Number(u.qty || 0);
    } else if (targetName) {
      // Fallback par nom uniquement sur declaration_especes si espece_id non fourni
      const usedByName: any[] = await db.execute(sql`
        SELECT COALESCE(quantity, 1) AS qty
        FROM declaration_especes
        WHERE permit_id = ${permitId} AND LOWER(translate(nom_espece,
          'àáâãäåèéêëìíîïòóôõöùúûüçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÿŸ',
          'aaaaaaeeeeiiiiooooouuuucAAAAAAEEEEIIIIOOOOOUUUUCyY'
        )) LIKE '%' || ${targetName} || '%'
      ` as any);
      for (const u of usedByName) totalUsed += Number(u.qty || 0);
    }

    const available = Math.max(0, totalBought - totalUsed);
    return res.json({ permitId, hunterId: permitHunterId, speciesId: speciesId || null, totalBought, totalUsed, available });
  } catch (err) {
    console.error('Erreur GET /api/taxes/usage:', err);
    return res.status(500).json({ message: "Impossible de calculer l'usage des taxes pour ce permis" });
  }
});

export default router;
