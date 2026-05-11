// @ts-nocheck
// Helper pour normaliser les rôles ('sub-agent' -> 'sub_agent')
function normalizeRole(role?: string): string | undefined {
  return role?.replace(/-/g, '_');
}
import { Request, Response, Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
// import { isAdmin } from '../src/middleware/roles.js';
import { sql } from 'drizzle-orm/sql';
import { z } from 'zod';
import { db } from '../db.js';
import { storage } from '../storage.js';


const router = Router();

// Schémas Zod minimaux (remplacent les schémas Drizzle retirés)
const baseHunterSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  // Important: la DB exige date_of_birth NOT NULL
  dateOfBirth: z.string().or(z.date()),
  phone: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  experience: z.number().optional().nullable(),
  profession: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  pays: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  departement: z.string().optional().nullable(),
  weaponType: z.any().optional().nullable(),
  weaponBrand: z.string().optional().nullable(),
  weaponReference: z.string().optional().nullable(),
  weaponCaliber: z.string().optional().nullable(),
  weaponOtherDetails: z.string().optional().nullable(),
  isMinor: z.boolean().optional(),
});

// Récupérer la liste nationale complète des chasseurs (tous)
router.get('/all', isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Autoriser admin, agent, sub-agent à consulter la liste nationale
    const role = (req.user as any)?.role as string | undefined;
    if (!role || !['admin', 'agent', 'sub-agent'].includes(role)) {
      return res.status(403).json({ message: "Accès refusé" });
    }

    // Admin: toujours autorisé
    if (role === 'admin') {
      const list = await storage.getAllHunters();
      const withMeta = await attachRegisteredBy(list as any);
      return res.json(withMeta);
    }

    // Pour agent et sub-agent: vérifier le flag national
    let nationalOverride = false;
    try {
      const rows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'national_agent_override' LIMIT 1`);
      if (rows && rows.length > 0) {
        const raw = (rows[0] as any).value;
        if (typeof raw === 'string') {
          try { nationalOverride = raw === 'true' ? true : !!JSON.parse(raw)?.enabled; } catch { nationalOverride = raw === 'true'; }
        } else if (typeof raw === 'object' && raw !== null) {
          nationalOverride = !!raw.enabled;
        }
      }
    } catch {}

    if (!nationalOverride) {
      return res.status(403).json({ message: "Accès refusé: l'accès national est désactivé par l'administrateur" });
    }

    const list = await storage.getAllHunters();
    const withMeta = await attachRegisteredBy(list as any);
    return res.json(withMeta);
  } catch (error) {
    console.error("Erreur lors de la récupération de la liste nationale des chasseurs:", error);
    return res.status(500).json({ message: "Échec de la récupération de la liste nationale des chasseurs" });
  }
});

// Vérifier la complétion du profil chasseur (nationalité, date de naissance pour calcul âge, catégorie)
router.get('/me/completion-status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user?.id as number | undefined;
    if (!currentUserId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const user = await storage.getUser(currentUserId);
    const hunterId = (user as any)?.hunterId || (user as any)?.hunter_id as number | undefined;

    if (!hunterId) {
      return res.json({ hasHunterProfile: false, isComplete: false, missingFields: ['hunterId'] });
    }

    const hunter = await storage.getHunter(hunterId);
    if (!hunter) {
      return res.json({ hasHunterProfile: false, isComplete: false, missingFields: ['hunterNotFound'] });
    }

    // hunter est déjà en camelCase via storage.getHunter()
    const nationality = (hunter as any).nationality as string | null | undefined;
    const category = (hunter as any).category as string | null | undefined;
    const dateOfBirthIso = (hunter as any).dateOfBirth as string | null | undefined;

    const nationalityOk = !!(nationality && String(nationality).trim());
    const categoryOk = !!(category && String(category).trim());
    const dobOk = !!dateOfBirthIso;

    let age: number | null = null;
    if (dobOk) {
      const dob = new Date(dateOfBirthIso as string);
      const today = new Date();
      let a = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) a--;
      age = a;
    }

    const missingFields: string[] = [];
    if (!nationalityOk) missingFields.push('nationality');
    if (!dobOk) missingFields.push('age'); // calculé depuis dateOfBirth
    if (!categoryOk) missingFields.push('category');

    const isComplete = nationalityOk && dobOk && categoryOk;
    return res.json({
      hasHunterProfile: true,
      isComplete,
      missingFields,
      details: {
        nationality: nationality ?? null,
        category: category ?? null,
        dateOfBirth: dateOfBirthIso ?? null,
        age,
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de complétion du profil chasseur:', error);
    return res.status(500).json({ message: 'Erreur lors de la vérification de complétion du profil chasseur' });
  }
});

// Endpoint pour récupérer tous les documents téléversés d'un chasseur depuis hunter_attachments
router.get('/my-documents', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user as any;
    const hunterId = currentUser?.hunterId;

    if (!hunterId) {
      return res.status(400).json({ error: 'Hunter ID not found' });
    }

    // Récupérer les données depuis hunter_attachments
    const attachments = await db.execute(sql`
      SELECT hunter_id,
             id_card_data, id_card_mime, id_card_name,
             weapon_permit_data, weapon_permit_mime, weapon_permit_name,
             hunter_photo_data, hunter_photo_mime, hunter_photo_name,
             treasury_stamp_data, treasury_stamp_mime, treasury_stamp_name,
             weapon_receipt_data, weapon_receipt_mime, weapon_receipt_name,
             insurance_data, insurance_mime, insurance_name,
             moral_certificate_data, moral_certificate_mime, moral_certificate_name,
             updated_at
      FROM hunter_attachments
      WHERE hunter_id = ${hunterId}
      LIMIT 1
    `);

    const attachment: any = Array.isArray(attachments) ? attachments[0] : attachments;

    if (!attachment) {
      return res.json([]);
    }

    // Transformer les données en format de documents
    interface HunterDocument {
      id: string;
      hunterId: number;
      documentType: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: string;
    }

    const documents: HunterDocument[] = [];
    const documentTypes = [
      { key: 'id_card', type: 'idCardDocument', label: 'Pièce d\'identité' },
      { key: 'weapon_permit', type: 'weaponPermit', label: 'Permis d\'arme' },
      { key: 'hunter_photo', type: 'hunterPhoto', label: 'Photo du chasseur' },
      { key: 'treasury_stamp', type: 'treasuryStamp', label: 'Timbre du trésor' },
      { key: 'weapon_receipt', type: 'weaponReceipt', label: 'Reçu d\'arme' },
      { key: 'insurance', type: 'insurance', label: 'Assurance' },
      { key: 'moral_certificate', type: 'moralCertificate', label: 'Certificat de moralité' }
    ];

    documentTypes.forEach((docType) => {
      const dataKey = `${docType.key}_data`;
      const mimeKey = `${docType.key}_mime`;
      const nameKey = `${docType.key}_name`;

      if (attachment[dataKey]) {
        const fileData = attachment[dataKey] as Buffer;
        documents.push({
          id: `${hunterId}_${docType.key}`,
          hunterId: hunterId,
          documentType: docType.type,
          fileName: (attachment[nameKey] as string) || `${docType.label}.pdf`,
          fileSize: fileData ? fileData.length : 0,
          mimeType: (attachment[mimeKey] as string) || 'application/octet-stream',
          uploadedAt: (attachment.updated_at as string) || new Date().toISOString()
        });
      }
    });

    res.json(documents);
  } catch (error) {
    console.error('Error fetching hunter documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rechercher des chasseurs par numéro d'identité (pour association avec guides)
router.get('/search', isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Support both legacy 'idNumber' and generic 'q'
    const raw = (typeof req.query.q === 'string' && req.query.q) || (typeof req.query.idNumber === 'string' && req.query.idNumber) || '';
    const q = raw.trim();
    if (!q) {
      return res.status(400).json({ message: "Paramètre 'q' requis" });
    }

    // Déterminer périmètre si override national désactivé
    const role = (req.user as any)?.role as string | undefined;
    const userRegion = String((req.user as any)?.region || '');
    const userDepartement = String((req.user as any)?.departement || (req.user as any)?.zone || '');

    let nationalOverride = false;
    try {
      const rows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'national_agent_override' LIMIT 1`);
      if (rows && rows.length > 0) {
        const rawV = (rows[0] as any).value;
        if (typeof rawV === 'string') {
          try { nationalOverride = rawV === 'true' ? true : !!JSON.parse(rawV)?.enabled; } catch { nationalOverride = rawV === 'true'; }
        } else if (typeof rawV === 'object' && rawV !== null) {
          nationalOverride = !!rawV.enabled;
        }
      }
    } catch {}

    // Construire le WHERE avec éventuellement des restrictions
    const baseWhere = `(
        h.id_number ILIKE '%${q.replace(/'/g, "''")}%' OR
        h.first_name ILIKE '%${q.replace(/'/g, "''")}%' OR
        h.last_name ILIKE '%${q.replace(/'/g, "''")}%' OR
        CAST(h.phone AS TEXT) ILIKE '%${q.replace(/'/g, "''")}%' OR
        p.permit_number ILIKE '%${q.replace(/'/g, "''")}%'
      )`;

    let scopeFilter = '';
    if (!nationalOverride && role && role !== 'admin') {
      if (role === 'agent' && userRegion) {
        scopeFilter = ` AND (h.region IS NOT NULL AND lower(h.region) = lower('${userRegion.replace(/'/g, "''")}'))`;
      } else if ((role === 'sub-agent' || role === 'sub_agent') && userDepartement) {
        scopeFilter = ` AND (h.departement IS NOT NULL AND lower(h.departement) = lower('${userDepartement.replace(/'/g, "''")}'))`;
      }
    }

    // Recherche: idNumber, firstName, lastName, phone, et numéro de permis
    // On renvoie des chasseurs DISTINCT (h.*) et on mappe au format API
    const sqlQuery = sql.raw(`
      SELECT DISTINCT h.*
      FROM hunters h
      LEFT JOIN permits p ON p.hunter_id = h.id
      WHERE ${baseWhere}${scopeFilter}
      ORDER BY h.created_at DESC
      LIMIT 25
    `);

    const rows = await db.execute(sqlQuery);
    const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
    res.json(mapped);
  } catch (error) {
    console.error('Erreur lors de la recherche de chasseurs:', error);
    res.status(500).json({ message: 'Échec de la recherche de chasseurs' });
  }
});



// Normalise le type d'arme venant du frontend pour correspondre à l'énum Prisma
function normalizeWeaponType(input: any): string | null {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  // Remplacer espaces/traits/accents par snake_case simple ASCII
  const ascii = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  // Mapping explicite des valeurs attendues
  const map: Record<string, string> = {
    fusil: 'fusil',
    carabine: 'carabine',
    arbalete: 'arbalete',
    arc: 'arc',
    // DB enum uses hyphen: 'lance-pierre'
    lance_pierre: 'lance-pierre',
    autre: 'autre',
  };
  return map[ascii] ?? ascii;
}

// Schéma pour la création d'un chasseur, incluant un userId optionnel
const createHunterWithUserSchema = baseHunterSchema.extend({
  userId: z.number().optional(),
});

// Mapping helper: API camelCase -> DB snake_case
function mapHunterToDb(data: any) {
  return {
    last_name: data.lastName,
    first_name: data.firstName,
    date_of_birth: typeof data.dateOfBirth === 'string' ? new Date(data.dateOfBirth) : data.dateOfBirth,
    id_number: data.idNumber,
    phone: data.phone ?? null,
    address: data.address ?? '',
    experience: data.experience ?? 0,
    profession: data.profession ?? '',
    category: data.category ?? '',
    pays: data.pays ?? null,
    nationality: data.nationality ?? null,
    region: data.region ?? null,
    departement: data.departement ?? null,
    // Cast to Prisma enum type to satisfy TS; normalization aligns with allowed values
    weapon_type: normalizeWeaponType(data.weaponType) as any,
    weapon_brand: data.weaponBrand ?? null,
    weapon_reference: data.weaponReference ?? null,
    weapon_caliber: data.weaponCaliber ?? null,
    weapon_other_details: data.weaponOtherDetails ?? null,
    is_minor: data.isMinor ?? false,
  };
}

// Mapping helper: DB snake_case -> API camelCase expected by frontend
function mapHunterToApi(h: any) {
  if (!h) return h;
  return {
    id: h.id,
    lastName: h.last_name ?? '',
    firstName: h.first_name ?? '',
    dateOfBirth: h.date_of_birth ? new Date(h.date_of_birth).toISOString() : null,
    idNumber: h.id_number ?? '',
    phone: h.phone ?? null,
    address: h.address ?? '',
    experience: h.experience ?? 0,
    profession: h.profession ?? '',
    category: h.category ?? '',
    pays: h.pays ?? null,
    nationality: h.nationality ?? null,
    region: h.region ?? null,
    departement: h.departement ?? null,
    createdByUserId: h.created_by_user_id ?? null,
    createdByRoleSnapshot: h.created_by_role_snapshot ?? null,
    createdByRegionSnapshot: h.created_by_region_snapshot ?? null,
    createdByDepartementSnapshot: h.created_by_departement_snapshot ?? null,
    weaponType: h.weapon_type ?? null,
    weaponBrand: h.weapon_brand ?? null,
    weaponReference: h.weapon_reference ?? null,
    weaponCaliber: h.weapon_caliber ?? null,
    weaponOtherDetails: h.weapon_other_details ?? null,
    isMinor: Boolean(h.is_minor),
    isActive: Boolean(h.is_active),
    createdAt: h.created_at ? new Date(h.created_at).toISOString() : undefined,
  };
}

async function attachRegisteredBy(hunters: any[]) {
  if (!Array.isArray(hunters) || hunters.length === 0) return hunters;

  // Prefer immutable snapshots stored on hunters when available (robust against history/user changes)
  const hasSnapshotData = hunters.some((h) =>
    (h && (h.createdByRoleSnapshot || h.created_by_role_snapshot)) ||
    (h && (h.createdByRegionSnapshot || h.created_by_region_snapshot)) ||
    (h && (h.createdByDepartementSnapshot || h.created_by_departement_snapshot))
  );

  if (hasSnapshotData) {
    return hunters.map((h) => {
      const role = normalizeRole(String(h?.createdByRoleSnapshot ?? h?.created_by_role_snapshot ?? ''));
      const region = String(h?.createdByRegionSnapshot ?? h?.created_by_region_snapshot ?? '').trim();
      const departement = String(h?.createdByDepartementSnapshot ?? h?.created_by_departement_snapshot ?? '').trim();

      let label = '';
      if (role === 'sub_agent') {
        label = `Secteur ${departement || '-'}`;
        if (region) label += ` / ${region}`;
      } else if (role === 'agent') {
        label = `IREF ${region || '-'}`;
      } else if (role === 'admin') {
        label = 'Admin';
      } else {
        label = '';
      }

      return {
        ...h,
        registeredBy: label || null,
      };
    });
  }

  const ids = hunters
    .map((h) => Number(h?.id))
    .filter((id) => Number.isFinite(id));
  if (ids.length === 0) return hunters;

  const creatorRows: any[] = await db.execute(sql.raw(`
    SELECT DISTINCT ON (hi.entity_id)
      hi.entity_id AS "hunterId",
      u.role AS "role",
      u.region AS "region",
      u.departement AS "departement"
    FROM history hi
    LEFT JOIN users u ON u.id = hi.user_id
    WHERE hi.entity_type = 'hunter'
      AND hi.operation = 'create_hunter'
      AND hi.entity_id IN (${ids.join(',')})
    ORDER BY hi.entity_id, hi.created_at DESC
  `));

  const labels = new Map<number, string>();
  for (const r of (creatorRows || [])) {
    const hunterId = Number((r as any).hunterId);
    const role = normalizeRole(String((r as any).role || ''));
    const region = String((r as any).region || '').trim();
    const departement = String((r as any).departement || '').trim();

    let label = '';
    if (role === 'sub_agent') {
      label = `Secteur ${departement || '-'}`;
      if (region) label += ` / ${region}`;
    } else if (role === 'agent') {
      label = `IREF ${region || '-'}`;
    } else if (role === 'admin') {
      label = 'Admin';
    } else {
      label = '';
    }
    if (label) labels.set(hunterId, label);
  }

  return hunters.map((h) => ({
    ...h,
    registeredBy: labels.get(Number(h?.id)) ?? null,
  }));
}

// Récupérer tous les chasseurs
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUser: any = req.user as any;
    const roleRaw: string | undefined = currentUser?.role;
    const role = normalizeRole(roleRaw);
    const userId: number | undefined = currentUser?.id;
    const region: string = String(currentUser?.region || '');
    const createdByMe = String(req.query.createdByMe || '').toLowerCase() === 'true';
    console.log(`[hunters] GET /api/hunters role=${role} region=${region} createdByMe=${createdByMe} userId=${userId}`);

    // Admin: retourne tout
    if (role === 'admin') {
      const list = await storage.getAllHunters();
      const withMeta = await attachRegisteredBy(list as any);
      return res.json(withMeta);
    }

    // Affichage des chasseurs créés par l'utilisateur (agent ou sub-agent)
    if ((role === 'agent' || role === 'sub_agent' || role === 'sub-agent') && createdByMe && userId) {
      // Utilise la table d'historique pour retrouver les chasseurs créés par l'utilisateur
      const rows = await db.execute(sql.raw(
        `SELECT h.*
         FROM hunters h
         WHERE h.id IN (
           SELECT entity_id
           FROM history
           WHERE entity_type = 'hunter'
             AND operation = 'create_hunter'
             AND user_id = ${userId}
         )`
      ));
      // Uniformiser le format de réponse côté API (camelCase)
      const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
      console.log(`[hunters] createdByMe rows=${Array.isArray(rows) ? (rows as any[]).length : 0}`);
      const withMeta = await attachRegisteredBy(mapped as any);
      return res.json(withMeta);
    }

    // Agent: filtre par région (par défaut)
    if (role === 'agent') {
      // Inclure:
      // 1) Chasseurs dont la région correspond (insensible à la casse)
      // 2) Chasseurs créés par des utilisateurs (agents/secteurs) de cette région via la table history
      const rows = await db.execute(sql.raw(
        `SELECT h.*
         FROM hunters h
         WHERE (
           h.region IS NOT NULL AND lower(h.region) = lower('${region}')
         )
         OR h.id IN (
           SELECT hi.entity_id
           FROM history hi
           INNER JOIN users u ON u.id = hi.user_id
           WHERE hi.entity_type = 'hunter'
             AND hi.operation = 'create_hunter'
             AND u.region IS NOT NULL
             AND lower(u.region) = lower('${region}')
         )
         ORDER BY h.created_at DESC`
      ));
      const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
      const withMeta = await attachRegisteredBy(mapped as any);
      return res.json(withMeta);
    }

    // Sub-agent: par défaut, même périmètre que l'agent (région)
    if (role === 'sub_agent' || role === 'sub-agent') {
      const rows = await db.execute(sql.raw(
        `SELECT h.*
         FROM hunters h
         WHERE (
           h.region IS NOT NULL AND lower(h.region) = lower('${region}')
         )
         OR h.id IN (
           SELECT hi.entity_id
           FROM history hi
           INNER JOIN users u ON u.id = hi.user_id
           WHERE hi.entity_type = 'hunter'
             AND hi.operation = 'create_hunter'
             AND u.region IS NOT NULL
             AND lower(u.region) = lower('${region}')
         )
         ORDER BY h.created_at DESC`
      ));
      const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
      const withMeta = await attachRegisteredBy(mapped as any);
      return res.json(withMeta);
    }

    return res.json([]);
  } catch (error) {
    console.error("Erreur lors de la récupération des chasseurs:", error);
    res.status(500).json({ message: "Échec de la récupération des chasseurs" });
  }
});

// Récupérer les chasseurs éligibles pour création de permis (avec demandes approuvées)
router.get('/eligible-for-permit', isAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log("Récupération des chasseurs éligibles pour création de permis");
    const eligibleHunters = await db.execute(sql.raw(
      `SELECT DISTINCT h.id, h.first_name AS "firstName", h.last_name AS "lastName", h.phone, h.region, h.date_of_birth AS "dateOfBirth"
       FROM hunters h
       INNER JOIN permit_requests pr ON h.id = pr.hunter_id
       WHERE pr.status = 'approved'
       AND h.id NOT IN (
         SELECT DISTINCT hunter_id FROM permits WHERE hunter_id IS NOT NULL
       )
       ORDER BY h.last_name, h.first_name`
    ));
    console.log(`${eligibleHunters.length} chasseurs éligibles trouvés`);
    res.json(eligibleHunters as any);
  } catch (error) {
    console.error("Erreur lors de la récupération des chasseurs éligibles:", error);
    res.status(500).json({ message: "Échec de la récupération des chasseurs éligibles" });
  }
});

// Créer un nouveau chasseur (auth requis) avec contrôle de périmètre (région/département)
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedBody = createHunterWithUserSchema.parse(req.body);
    const { userId, ...hunterData } = validatedBody;
    const effectiveUserId = userId ?? (req.user?.id as number | undefined);

    // Enforcer le périmètre selon le rôle
    const role = normalizeRole((req.user as any)?.role as string | undefined);
    const userRegion = String((req.user as any)?.region || '');

    // Construire une copie mutable
    const scopedHunterData: typeof hunterData = { ...hunterData } as any;
    // Compat: si le frontend envoie 'zone', le mapper vers 'departement'
    if (!scopedHunterData.departement && typeof (req.body as any)?.zone === 'string' && (req.body as any).zone.trim() !== '') {
      (scopedHunterData as any).departement = (req.body as any).zone;
    }
    // S'assurer que dateOfBirth transite bien même si côté client envoie une string
    if ((req.body as any)?.dateOfBirth && scopedHunterData.dateOfBirth === undefined) {
      (scopedHunterData as any).dateOfBirth = (req.body as any).dateOfBirth;
    }

    // Politique mise à jour: les agents régionaux et agents de secteur peuvent créer
    // des chasseurs sur l'ensemble du territoire (liste nationale), sans restriction de région.
    // On ne force plus la région ni ne bloque si différente de celle de l'utilisateur.

    // Unicité par numéro de pièce d'identité (idNumber) pour éviter les doublons de compte chasseur
    try {
      const rawId = (hunterData as any)?.idNumber ?? (req.body as any)?.idNumber;
      const idNum = typeof rawId === 'string' ? rawId.trim() : '';
      if (idNum) {
        const exists = await db.execute(sql.raw(`
          SELECT 1 FROM hunters WHERE id_number = '${idNum.replace(/'/g, "''")}' LIMIT 1
        `));
        if (Array.isArray(exists) && exists.length > 0) {
          return res.status(409).json({
            message: "Un chasseur avec ce numéro de pièce d'identité existe déjà.",
            code: 'HUNTER_ID_NUMBER_DUPLICATE',
          });
        }
      }
    } catch (_) { /* fallback sur contrainte DB s'il y en a */ }

    // Adapter les champs pour le storage (camelCase)
    const storageData: any = {
      ...scopedHunterData,
      // Normaliser le type d'arme pour coller à l'enum
      weaponType: normalizeWeaponType((scopedHunterData as any).weaponType) as any,
      // Robust creator tracking (FK + snapshots)
      createdByUserId: (req.user as any)?.id ?? null,
      createdByRoleSnapshot: String((req.user as any)?.role ?? ''),
      createdByRegionSnapshot: ((req.user as any)?.region ?? null) ? String((req.user as any)?.region) : null,
      createdByDepartementSnapshot: ((req.user as any)?.departement ?? null) ? String((req.user as any)?.departement) : null,
    };

    // Create hunter via Drizzle storage
    const created = await storage.createHunter(storageData as any);

    if (effectiveUserId) {
      try {
        await storage.assignHunterToUser(effectiveUserId, created.id);
      } catch (e) {
        console.warn(`Association utilisateur ${effectiveUserId} -> chasseur ${created.id} a échoué:`, e);
      }
    }

    // Ajouter une entrée d'historique
    // Si [isAuthenticated, isAdmin] est ajouté, req.user sera disponible
    const actorId = req.user?.id; // Sera undefined si la route n'est pas protégée
    await storage.createHistory({
      userId: actorId ?? null,
      operation: 'create_hunter',
      entityType: 'hunter',
      entityId: created.id,
      details: `Nouveau chasseur créé (ID ${created.id})${userId ? ` et associé à l'utilisateur ID ${userId}` : ''}`,
    } as any);

    res.status(201).json(mapHunterToApi(created));
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Erreur de validation Zod lors de la création du chasseur:", error.errors);
      return res.status(400).json({ message: "Données invalides", errors: error.errors });
    }
    // Gestion des erreurs Prisma (ex: contraintes uniques)
    const anyErr: any = error;
    if (anyErr && anyErr.code === 'P2002') {
      const target = Array.isArray(anyErr.meta?.target) ? anyErr.meta.target.join(',') : String(anyErr.meta?.target ?? 'unknown');
      console.warn(`Contrainte unique violée lors de la création du chasseur (target: ${target})`);
      // Si l'unicité porte sur id_number, renvoyer un message explicite au client
      if (target.includes('id_number')) {
        return res.status(409).json({
          message: "Ce numéro de pièce d'identité est déjà utilisé par un autre chasseur.",
          field: 'idNumber',
          code: 'HUNTER_ID_NUMBER_DUPLICATE',
        });
      }
      return res.status(409).json({
        message: "Contrainte d'unicité violée lors de la création du chasseur.",
        target,
        code: 'PRISMA_P2002',
      });
    }
    console.error("Erreur lors de la création du chasseur:", error);
    // S'assurer que l'erreur est sérialisable ou envoyer un message générique
    const errorMessage = error instanceof Error ? error.message : "Une erreur interne est survenue.";
    res.status(500).json({ message: "Échec de la création du chasseur", error: errorMessage });
  }
});

// Mettre à jour un chasseur existant
router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID du chasseur invalide" });
    }
    // Normaliser: convertir les chaînes vides en undefined pour une mise à jour partielle propre
    const rawBody: any = req.body || {};
    const preSanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawBody)) {
      // Garder null explicite pour permettre la mise à jour de champs optionnels
      if (v === "" && k !== 'departement' && k !== 'zone') continue; // ignorer les champs vides sauf departement/zone
      preSanitized[k] = v;
    }

    // Compat: si le frontend envoie 'zone', le mapper vers 'departement' (aligné sur POST)
    // Accepter aussi les valeurs vides pour permettre la mise à jour
    if ('zone' in rawBody && !preSanitized.departement) {
      preSanitized.departement = rawBody.zone || null;
    }

    // Valider les données après normalisation
    const validatedData = baseHunterSchema.partial().parse(preSanitized);
    // Normaliser weaponType si fourni
    const storageUpdate: any = {
      ...validatedData,
    };
    if ((validatedData as any).weaponType !== undefined) {
      storageUpdate.weaponType = normalizeWeaponType((validatedData as any).weaponType) as any;
    }
    // Normaliser la date de naissance si fournie (colonne DATE)
    if ((validatedData as any).dateOfBirth !== undefined) {
      const dob: any = (validatedData as any).dateOfBirth;
      if (dob instanceof Date) {
        storageUpdate.dateOfBirth = dob.toISOString().split('T')[0];
      } else if (typeof dob === 'string') {
        storageUpdate.dateOfBirth = dob.includes('T') ? dob.split('T')[0] : dob;
      }
    }
    // Éviter d'écrire NULL dans des colonnes NON NULL de la DB
    const nonNullableKeys: Array<keyof typeof storageUpdate> = [
      'lastName',
      'firstName',
      'dateOfBirth',
      'idNumber',
      'address',
      'experience',
      'profession',
      'category',
    ] as any;
    for (const k of nonNullableKeys) {
      if (k in storageUpdate && storageUpdate[k as any] === null) {
        delete storageUpdate[k as any];
      }
    }
    // Dernière passe: ne pas envoyer des chaînes vides en DB
    for (const [k, v] of Object.entries(storageUpdate)) {
      if (v === "") delete (storageUpdate as any)[k];
    }

    const updatedHunter = await storage.updateHunter(hunterId, storageUpdate as any);

    if (!updatedHunter) {
      return res.status(404).json({ message: "Chasseur non trouvé" });
    }

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: req.user?.id ?? null,
      operation: 'update',
      entityType: 'hunter',
      entityId: hunterId,
      details: `Mise à jour du chasseur ID ${hunterId}`,
    } as any);

    res.json(mapHunterToApi(updatedHunter));
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Erreur de validation Zod lors de la mise à jour du chasseur:", error.errors);
      return res.status(400).json({ message: "Données invalides", errors: error.errors });
    }
    console.error("Erreur lors de la mise à jour du chasseur:", error);
    res.status(400).json({ message: "Échec de la mise à jour du chasseur" });
  }
});

// Activer le profil d'un chasseur
router.put('/:id/activate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID du chasseur invalide" });
    }
    // Charger l'état actuel du chasseur
    const row = await db.execute(sql`SELECT id, is_active AS "isActive" FROM hunters WHERE id = ${hunterId} LIMIT 1`);
    const current = Array.isArray(row) ? (row as any[])[0] : undefined;
    if (!current) {
      return res.status(404).json({ message: "Chasseur non trouvé" });
    }

    // Si le chasseur est suspendu (isActive = false), appliquer les règles strictes de réactivation
    if (!current.isActive) {
      try {
        // Dernier acteur ayant suspendu le profil
        const hist: any[] = await db.execute(sql.raw(`
          SELECT user_id AS "userId" FROM history
          WHERE entity_type = 'hunter' AND entity_id = ${hunterId} AND operation IN ('suspend_profile','suspend')
          ORDER BY created_at DESC
          LIMIT 1
        `));
        const suspenderId: number | null = (Array.isArray(hist) && hist[0] && hist[0].userId) ? Number(hist[0].userId) : null;

        const actor = req.user as any;
        const actorId = Number(actor?.id);
        const actorRole = String(actor?.role || '');
        const actorRegion = String((actor as any)?.region || '');

        // Si admin: autorisé
        const isAdmin = actorRole === 'admin';
        // Si c'est l'agent qui a suspendu: autorisé
        const isSuspender = suspenderId !== null && actorId === suspenderId;
        // Si agent régional de l'agent qui a suspendu: autorisé
        let isRegionalOfSuspender = false;
        if (suspenderId && actorRole === 'agent' && actorRegion) {
          const suspRows = await db.execute(sql`SELECT region FROM users WHERE id = ${suspenderId} LIMIT 1`);
          const suspRegion = Array.isArray(suspRows) && suspRows[0] ? String((suspRows[0] as any).region || '') : '';
          if (suspRegion && actorRegion && suspRegion.toLowerCase() === actorRegion.toLowerCase()) {
            isRegionalOfSuspender = true;
          }
        }

        if (!(isAdmin || isSuspender || isRegionalOfSuspender)) {
          return res.status(403).json({
            message: "Réactivation refusée: seuls l'administrateur, l'agent ayant suspendu, ou l'agent régional de cet agent peuvent réactiver ce chasseur."
          });
        }
      } catch (e) {
        // En cas d'échec de lecture de l'historique, par sécurité, bloquer pour non-admin
        const actor = req.user as any;
        if (actor?.role !== 'admin') {
          return res.status(403).json({ message: "Réactivation refusée (historique indisponible)" });
        }
      }
    }

    const activatedHunter = await storage.activateHunterProfile(hunterId);

    if (!activatedHunter) {
      return res.status(404).json({ message: "Chasseur non trouvé ou échec de l'activation" });
    }

    // Mettre à jour tous les permis du chasseur => Actif
    const permitsActivated = await db.execute(sql.raw(
      `UPDATE permits SET status = 'active' WHERE hunter_id = ${hunterId}`
    ));

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: req.user?.id ?? null,
      operation: 'activate_profile',
      entityType: 'hunter',
      entityId: hunterId,
      details: `Profil du chasseur ID ${hunterId} activé; permis réactivés`,
    } as any);

    res.json(mapHunterToApi(activatedHunter));
  } catch (error) {
    console.error("Erreur lors de l'activation du profil du chasseur:", error);
    res.status(500).json({ message: "Échec de l'activation du profil du chasseur" });
  }
});

// Suspendre/Désactiver le profil d'un chasseur
router.put('/:id/suspend', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID du chasseur invalide" });
    }

    const actor = req.user as any;
    const role = normalizeRole(String(actor?.role || ''));
    const actorRegion = String(actor?.region || '');
    const actorDepartement = String(actor?.departement || actor?.zone || '');

    if (!role || !['admin', 'agent', 'sub_agent'].includes(role)) {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (role !== 'admin') {
      const rows: any[] = await db.execute(sql`SELECT region, departement FROM hunters WHERE id = ${hunterId} LIMIT 1`);
      const hunterRegion = rows && rows[0] ? String((rows[0] as any).region || '') : '';
      const hunterDepartement = rows && rows[0] ? String((rows[0] as any).departement || '') : '';
      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Chasseur non trouvé" });
      }

      if (role === 'agent') {
        if (!actorRegion || !hunterRegion || hunterRegion.toLowerCase() !== actorRegion.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé" });
        }
      }

      if (role === 'sub_agent') {
        if (!actorDepartement || !hunterDepartement || hunterDepartement.toLowerCase() !== actorDepartement.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé" });
        }
      }
    }

    const suspendedHunter = await storage.suspendHunter(hunterId);

    if (!suspendedHunter) {
      return res.status(404).json({ message: "Chasseur non trouvé ou échec de la suspension" });
    }

    // Mettre à jour tous les permis du chasseur => Suspendu
    await db.execute(sql.raw(
      `UPDATE permits SET status = 'suspended' WHERE hunter_id = ${hunterId}`
    ));

    // Ajouter une entrée d'historique
    await storage.createHistory({
      userId: req.user?.id ?? null,
      operation: 'suspend_profile',
      entityType: 'hunter',
      entityId: hunterId,
      details: `Profil du chasseur ID ${hunterId} suspendu/désactivé`,
    } as any);

    res.json(mapHunterToApi(suspendedHunter));
  } catch (error) {
    console.error("Erreur lors de la suspension du profil du chasseur:", error);
    res.status(500).json({ message: "Échec de la suspension du profil du chasseur" });
  }
});

// Supprimer un chasseur
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID du chasseur invalide" });
    }

    const actor = req.user as any;
    const role = normalizeRole(String(actor?.role || ''));
    const actorRegion = String(actor?.region || '');
    const actorDepartement = String(actor?.departement || actor?.zone || '');

    if (!role || !['admin', 'agent', 'sub_agent'].includes(role)) {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (role !== 'admin') {
      const rows: any[] = await db.execute(sql`SELECT region, departement FROM hunters WHERE id = ${hunterId} LIMIT 1`);
      const hunterRegion = rows && rows[0] ? String((rows[0] as any).region || '') : '';
      const hunterDepartement = rows && rows[0] ? String((rows[0] as any).departement || '') : '';
      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Chasseur non trouvé" });
      }

      if (role === 'agent') {
        if (!actorRegion || !hunterRegion || hunterRegion.toLowerCase() !== actorRegion.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé" });
        }
      }

      if (role === 'sub_agent') {
        if (!actorDepartement || !hunterDepartement || hunterDepartement.toLowerCase() !== actorDepartement.toLowerCase()) {
          return res.status(403).json({ message: "Accès refusé" });
        }
      }
    }

    // Récupérer le paramètre force depuis l'URL
    const force = String(req.query.force).toLowerCase() === 'true';
    console.log(`🔧 Suppression du chasseur ${hunterId}, force=${force}`);

    const ok = await storage.deleteHunter(hunterId, force);
    if (!ok) return res.status(500).json({ message: "Échec de la suppression du chasseur" });

    // Ajouter une entrée d'historique
    try {
      await storage.createHistory({
        userId: req.user?.id ?? null,
        operation: 'delete',
        entityType: 'hunter',
        entityId: hunterId,
        details: `Chasseur supprimé: ID ${hunterId}`,
      } as any);
    } catch (e) {
      console.warn(`[hunters] delete history write failed for hunterId=${hunterId}`, e);
    }

    res.status(200).json({ message: "Chasseur supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du chasseur:", error);
    res.status(500).json({ message: "Échec de la suppression du chasseur" });
  }
});

// Vérifier l'existence d'un chasseur par ID - Pas d'authentification requise pour l'inscription
router.get('/check-id/:id', async (req: Request, res: Response) => {
  try {
    const idNumber = req.params.id;

    // Vérifier si le chasseur existe par son numéro d'identification
    const hunter = await storage.getHunterByIdNumber(idNumber);

    if (!hunter) {
      return res.json({ exists: false });
    }

    return res.json({ exists: true, hunter });
  } catch (error) {
    console.error("Erreur lors de la vérification de l'ID du chasseur:", error);
    res.status(500).json({ message: "Erreur lors de la vérification de l'ID du chasseur" });
  }
});

// Récupérer les chasseurs par région (endpoint utilisé par le frontend)
router.get('/region/:region', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const region = String(req.params.region);
    const rows = await storage.getHuntersByRegion(region);
    const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
    return res.json(mapped);
  } catch (error) {
    console.error("Erreur lors de la récupération des chasseurs par région:", error);
    return res.status(500).json({ message: "Échec de la récupération des chasseurs par région" });
  }
});

// Récupérer les chasseurs par département
router.get('/departement/:departement', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const departement = String(req.params.departement);
    const rows = await storage.getHuntersByDepartement(departement);
    const mapped = Array.isArray(rows) ? (rows as any[]).map(mapHunterToApi) : [];
    return res.json(mapped);
  } catch (error) {
    console.error("Erreur lors de la récupération des chasseurs par département:", error);
    return res.status(500).json({ message: "Échec de la récupération des chasseurs par département" });
  }
});

// Récupérer le profil chasseur du user connecté
router.get('/me', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user?.id as number | undefined;
    if (!currentUserId) {
      return res.status(401).json({ message: "Non authentifié" });
    }

    // Charger l'utilisateur pour obtenir son hunterId
    const user = await storage.getUser(currentUserId);
    console.log(`[DEBUG] User ${currentUserId} full data:`, JSON.stringify(user, null, 2));

    // Essayer les deux formats : camelCase et snake_case
    const hunterId = (user as any)?.hunterId || (user as any)?.hunter_id as number | undefined;
    console.log(`[DEBUG] hunterId final:`, hunterId, typeof hunterId);

    if (!hunterId) {
      return res.status(404).json({ message: "Aucun profil chasseur associé" });
    }

    if (isNaN(hunterId) || hunterId <= 0) {
      console.log(`[DEBUG] Invalid hunterId: ${hunterId} (isNaN: ${isNaN(hunterId)}, <= 0: ${hunterId <= 0})`);
      return res.status(400).json({
        message: "ID du chasseur invalide",
        debug: {
          hunterId,
          type: typeof hunterId,
          isNaN: isNaN(hunterId),
          isLessOrEqual0: hunterId <= 0,
          userKeys: user ? Object.keys(user) : 'no user'
        }
      });
    }

    const hunter = await storage.getHunter(hunterId);
    if (!hunter) {
      return res.status(404).json({ message: "Chasseur non trouvé" });
    }

    // storage.getHunter() renvoie déjà en camelCase
    return res.json(hunter);
  } catch (error) {
    console.error("Erreur lors de la récupération du profil chasseur (me):", error);
    return res.status(500).json({ message: "Erreur lors de la récupération du profil chasseur" });
  }
});

// Récupérer un chasseur par son ID
router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID invalide" });
    }
    const hunter = await storage.getHunter(hunterId);
    if (!hunter) {
      return res.status(404).json({ message: "Chasseur non trouvé" });
    }
    // storage.getHunter() renvoie déjà un objet au format API (camelCase)
    const withMetaList = await attachRegisteredBy([hunter] as any);
    res.json((withMetaList && withMetaList[0]) ? withMetaList[0] : hunter);
  } catch (error) {
    console.error("Erreur lors de la récupération du chasseur:", error);
    res.status(500).json({ message: "Erreur lors de la récupération du chasseur" });
  }
});

// Récupérer la photo d'un chasseur
router.get('/:id/photo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const hunterId = Number(req.params.id);
    if (isNaN(hunterId)) {
      return res.status(400).json({ message: "ID invalide" });
    }

    const hunter = await storage.getHunter(hunterId);
    if (!hunter) {
      return res.status(404).json({ message: "Chasseur non trouvé" });
    }

    // Pour l'instant, retourner une erreur 404 car les photos ne sont pas encore implémentées
    // TODO: Implémenter le stockage et la récupération des photos chasseur
    return res.status(404).json({ message: "Photo non disponible" });

    // Code futur pour servir les photos:
    // const photoPath = path.join(process.cwd(), 'uploads', 'hunters', `${hunterId}.jpg`);
    // if (fs.existsSync(photoPath)) {
    //   return res.sendFile(photoPath);
    // } else {
    //   return res.status(404).json({ message: "Photo non trouvée" });
    // }
  } catch (error) {
    console.error("Erreur lors de la récupération de la photo:", error);
    res.status(500).json({ message: "Erreur lors de la récupération de la photo" });
  }
});

export default router;
