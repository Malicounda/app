import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { storage } from '../storage.js';

export type DossierVerificationStatus = 'pending' | 'validated' | 'rejected';

export interface HunterDossierVerification {
  hunterId: number;
  status: DossierVerificationStatus;
  invalidatedDocs: string[];
  reason: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  updatedAt: string | null;
  campaignYear: string | null;
  campaignOpen: boolean;
  campaignEndDate: string | null;
  validatedByActivePermit?: boolean;
  expiredForNewCampaign?: boolean;
}

export const HUNTER_DOC_LABELS: Record<string, string> = {
  idCardDocument: "Pièce d'identité",
  weaponPermit: "Permis de Port d'Arme",
  hunterPhoto: 'Photo du Chasseur',
  treasuryStamp: 'Timbre Impôt',
  weaponReceipt: "Quittance de l'Arme par le Trésor",
  insurance: 'Assurance',
  moralCertificate: 'Club de Tir (carte) / ou Justificatif',
};

export const HUNTER_DOC_CODES = Object.keys(HUNTER_DOC_LABELS);

export function normalizeDocCode(input: string): string | null {
  const key = String(input || '').trim();
  const map: Record<string, string> = {
    idCardDocument: 'idCardDocument',
    id_card_document: 'idCardDocument',
    id_card: 'idCardDocument',
    weaponPermit: 'weaponPermit',
    weapon_permit: 'weaponPermit',
    hunterPhoto: 'hunterPhoto',
    hunter_photo: 'hunterPhoto',
    treasuryStamp: 'treasuryStamp',
    treasury_stamp: 'treasuryStamp',
    weaponReceipt: 'weaponReceipt',
    weapon_receipt: 'weaponReceipt',
    insurance: 'insurance',
    moralCertificate: 'moralCertificate',
    moral_certificate: 'moralCertificate',
  };
  return map[key] ?? null;
}

let tableReadyPromise: Promise<void> | null = null;

export async function ensureHunterDossierVerificationTable(): Promise<void> {
  if (!tableReadyPromise) {
    tableReadyPromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS hunter_dossier_verifications (
          hunter_id INTEGER PRIMARY KEY,
          status VARCHAR(32) NOT NULL DEFAULT 'pending',
          invalidated_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
          reason TEXT,
          reviewed_by INTEGER,
          reviewed_at TIMESTAMP,
          campaign_year VARCHAR(32),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      ` as any);
      await db.execute(sql`
        ALTER TABLE hunter_dossier_verifications
        ADD COLUMN IF NOT EXISTS campaign_year VARCHAR(32)
      ` as any);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS hunter_autovalidation_rules (
          id SERIAL PRIMARY KEY,
          scope_type VARCHAR(24) NOT NULL,
          mode VARCHAR(24),
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          region VARCHAR(120),
          departement VARCHAR(120),
          commune VARCHAR(120),
          user_id INTEGER,
          created_by INTEGER,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      ` as any);
    })().catch((err) => {
      tableReadyPromise = null;
      throw err;
    });
  }
  await tableReadyPromise;
}

export type AutoValidationMode = 'manual' | 'rules' | 'all';

export interface AutoValidationRule {
  id: number;
  scopeType: 'global' | 'territory' | 'agent';
  mode: AutoValidationMode | null;
  enabled: boolean;
  region: string | null;
  departement: string | null;
  commune: string | null;
  userId: number | null;
  createdBy: number | null;
  updatedAt: string | null;
}

function normalizeText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseAutoRule(r: any): AutoValidationRule {
  return {
    id: Number(r.id),
    scopeType: (r.scope_type || 'territory') as any,
    mode: (r.mode || null) as AutoValidationMode | null,
    enabled: Boolean(r.enabled),
    region: r.region ?? null,
    departement: r.departement ?? null,
    commune: r.commune ?? null,
    userId: r.user_id != null ? Number(r.user_id) : null,
    createdBy: r.created_by != null ? Number(r.created_by) : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export async function getAutoValidationConfig(): Promise<{
  mode: AutoValidationMode;
  territoryRules: AutoValidationRule[];
  agentRules: AutoValidationRule[];
}> {
  await ensureHunterDossierVerificationTable();
  const res: any = await db.execute(sql`
    SELECT id, scope_type, mode, enabled, region, departement, commune, user_id, created_by, updated_at
    FROM hunter_autovalidation_rules
    ORDER BY id DESC
  ` as any);
  const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
  const parsed = rows.map(parseAutoRule);
  const globalRow = parsed.find((r) => r.scopeType === 'global');
  const rawMode = globalRow?.mode;
  const mode: AutoValidationMode =
    rawMode === 'rules' || rawMode === 'all' ? rawMode : 'manual';

  return {
    mode,
    territoryRules: parsed.filter((r) => r.scopeType === 'territory'),
    agentRules: parsed.filter((r) => r.scopeType === 'agent'),
  };
}

export async function setAutoValidationMode(mode: AutoValidationMode, actorId: number): Promise<AutoValidationMode> {
  await ensureHunterDossierVerificationTable();
  const existing: any = await db.execute(sql`
    SELECT id FROM hunter_autovalidation_rules WHERE scope_type = 'global' LIMIT 1
  ` as any);
  const rows: any[] = Array.isArray(existing) ? existing : (existing?.rows || []);
  if (rows.length > 0) {
    await db.execute(sql`
      UPDATE hunter_autovalidation_rules
      SET mode = ${mode}, enabled = TRUE, created_by = ${actorId}, updated_at = NOW()
      WHERE id = ${Number(rows[0].id)}
    ` as any);
  } else {
    await db.execute(sql`
      INSERT INTO hunter_autovalidation_rules (scope_type, mode, enabled, created_by, updated_at)
      VALUES ('global', ${mode}, TRUE, ${actorId}, NOW())
    ` as any);
  }
  return mode;
}

export async function addTerritoryAutoValidationRule(
  payload: { region: string; departement?: string | null; commune?: string | null },
  actorId: number
): Promise<AutoValidationRule> {
  await ensureHunterDossierVerificationTable();
  const region = String(payload.region || '').trim();
  const departement = payload.departement ? String(payload.departement).trim() : null;
  const commune = payload.commune ? String(payload.commune).trim() : null;
  if (!region) {
    throw new Error('Veuillez sélectionner une région.');
  }
  const res: any = await db.execute(sql`
    INSERT INTO hunter_autovalidation_rules (scope_type, enabled, region, departement, commune, created_by, updated_at)
    VALUES ('territory', TRUE, ${region}, ${departement || null}, ${commune || null}, ${actorId}, NOW())
    RETURNING id, scope_type, mode, enabled, region, departement, commune, user_id, created_by, updated_at
  ` as any);
  const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
  return parseAutoRule(rows[0]);
}

export async function setAgentAutoValidationRule(
  userId: number,
  enabled: boolean,
  actorId: number
): Promise<AutoValidationRule> {
  await ensureHunterDossierVerificationTable();
  const existing: any = await db.execute(sql`
    SELECT id FROM hunter_autovalidation_rules
    WHERE scope_type = 'agent' AND user_id = ${userId}
    LIMIT 1
  ` as any);
  const rows: any[] = Array.isArray(existing) ? existing : (existing?.rows || []);
  if (rows.length > 0) {
    const upd: any = await db.execute(sql`
      UPDATE hunter_autovalidation_rules
      SET enabled = ${enabled}, created_by = ${actorId}, updated_at = NOW()
      WHERE id = ${Number(rows[0].id)}
      RETURNING id, scope_type, mode, enabled, region, departement, commune, user_id, created_by, updated_at
    ` as any);
    const updRows: any[] = Array.isArray(upd) ? upd : (upd?.rows || []);
    return parseAutoRule(updRows[0]);
  }
  const ins: any = await db.execute(sql`
    INSERT INTO hunter_autovalidation_rules (scope_type, enabled, user_id, created_by, updated_at)
    VALUES ('agent', ${enabled}, ${userId}, ${actorId}, NOW())
    RETURNING id, scope_type, mode, enabled, region, departement, commune, user_id, created_by, updated_at
  ` as any);
  const insRows: any[] = Array.isArray(ins) ? ins : (ins?.rows || []);
  return parseAutoRule(insRows[0]);
}

export async function toggleAutoValidationRule(ruleId: number, enabled: boolean): Promise<void> {
  await ensureHunterDossierVerificationTable();
  await db.execute(sql`
    UPDATE hunter_autovalidation_rules
    SET enabled = ${enabled}, updated_at = NOW()
    WHERE id = ${ruleId} AND scope_type <> 'global'
  ` as any);
}

export async function deleteAutoValidationRule(ruleId: number): Promise<void> {
  await ensureHunterDossierVerificationTable();
  await db.execute(sql`
    DELETE FROM hunter_autovalidation_rules
    WHERE id = ${ruleId} AND scope_type <> 'global'
  ` as any);
}

export async function shouldAutoValidateForCreator(
  creator: {
    id?: number | null;
    role?: string | null;
    isSuperAdmin?: boolean;
    region?: string | null;
    departement?: string | null;
    zone?: string | null;
  },
  hunterLocation: {
    region?: string | null;
    departement?: string | null;
    zone?: string | null;
    address?: string | null;
  }
): Promise<boolean> {
  try {
    const roleLower = String(creator?.role || '').toLowerCase();
    // Seul le SuperAdmin dispose de la compétence par défaut (Admin Chasse est soumis aux règles !)
    if (creator?.isSuperAdmin === true || roleLower === 'superadmin' || roleLower === 'super_admin') {
      return true;
    }

    const { mode, territoryRules, agentRules } = await getAutoValidationConfig();
    if (mode === 'manual') return false;
    if (mode === 'all') return true;

    // Mode 'rules' : vérifier d'abord la délégation spécifique par agent (incluant Admin Chasse)
    if (creator?.id != null) {
      const matchedAgent = agentRules.find((r) => r.enabled && r.userId === Number(creator.id));
      if (matchedAgent) return true;
    }

    // Ensuite vérifier les règles par territoire (Région / Département / Commune)
    const targetRegion = normalizeText(hunterLocation.region || creator.region);
    const targetDept = normalizeText(hunterLocation.departement || creator.departement);
    const targetCommune = normalizeText(hunterLocation.zone || creator.zone || hunterLocation.address);

    for (const rule of territoryRules) {
      if (!rule.enabled) continue;
      const rReg = normalizeText(rule.region);
      const rDep = normalizeText(rule.departement);
      const rCom = normalizeText(rule.commune);

      if (!rReg || rReg !== targetRegion) continue;
      if (rDep && rDep !== targetDept) continue;
      if (rCom && (!targetCommune || (!targetCommune.includes(rCom) && !rCom.includes(targetCommune)))) continue;
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[hunterDossierVerification] shouldAutoValidateForCreator fallback false:', err);
    return false;
  }
}

export async function getCurrentCampaignContext(): Promise<{
  campaignYear: string | null;
  campaignOpen: boolean;
  campaignStartDate: string | null;
  campaignEndDate: string | null;
}> {
  try {
    const settings = await storage.getHuntingCampaignSettings();
    if (!settings) {
      return {
        campaignYear: String(new Date().getFullYear()),
        campaignOpen: true,
        campaignStartDate: null,
        campaignEndDate: null,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDateObj = settings.endDate ? new Date(settings.endDate) : null;
    if (endDateObj && !Number.isNaN(endDateObj.getTime())) {
      endDateObj.setHours(23, 59, 59, 999);
    }
    const notPastEnd = !endDateObj || Number.isNaN(endDateObj.getTime()) || today.getTime() <= endDateObj.getTime();
    const campaignOpen = settings.isActive !== false && notPastEnd;
    return {
      campaignYear: settings.year ? String(settings.year) : String(new Date().getFullYear()),
      campaignOpen,
      campaignStartDate: settings.startDate || null,
      campaignEndDate: settings.endDate || null,
    };
  } catch (err) {
    console.warn('[hunterDossierVerification] getCurrentCampaignContext fallback:', err);
    return {
      campaignYear: String(new Date().getFullYear()),
      campaignOpen: true,
      campaignStartDate: null,
      campaignEndDate: null,
    };
  }
}

function parseRow(
  row: any,
  campaignCtx: { campaignYear: string | null; campaignOpen: boolean; campaignEndDate: string | null },
  hasActivePermit: boolean
): HunterDossierVerification {
  let invalidatedDocs: string[] = [];
  if (Array.isArray(row?.invalidated_docs)) {
    invalidatedDocs = row.invalidated_docs.map(String);
  } else if (typeof row?.invalidated_docs === 'string') {
    try {
      const parsed = JSON.parse(row.invalidated_docs);
      if (Array.isArray(parsed)) invalidatedDocs = parsed.map(String);
    } catch {
      invalidatedDocs = [];
    }
  }
  const rawStatus = String(row?.status || 'pending');
  let status: DossierVerificationStatus =
    rawStatus === 'validated' || rawStatus === 'rejected' ? rawStatus : 'pending';
  const storedCampaignYear: string | null = row?.campaign_year ? String(row.campaign_year) : null;
  let expiredForNewCampaign = false;
  let validatedByActivePermit = false;

  // Si validé lors d'une campagne précédente → nécessite une nouvelle validation pour la campagne en cours
  if (
    status === 'validated' &&
    storedCampaignYear &&
    campaignCtx.campaignYear &&
    storedCampaignYear !== campaignCtx.campaignYear
  ) {
    status = 'pending';
    expiredForNewCampaign = true;
  }

  // Si un chasseur existant a déjà un permis actif (non expiré) pour la campagne en cours et n'est pas invalidé
  if (status === 'pending' && !expiredForNewCampaign && hasActivePermit && campaignCtx.campaignOpen) {
    status = 'validated';
    validatedByActivePermit = true;
  }

  return {
    hunterId: Number(row.hunter_id),
    status,
    invalidatedDocs,
    reason: row?.reason ?? null,
    reviewedBy: row?.reviewed_by != null ? Number(row.reviewed_by) : null,
    reviewedAt: row?.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    campaignYear: campaignCtx.campaignYear,
    campaignOpen: campaignCtx.campaignOpen,
    campaignEndDate: campaignCtx.campaignEndDate,
    validatedByActivePermit,
    expiredForNewCampaign,
  };
}

export function defaultVerification(
  hunterId: number,
  campaignCtx?: { campaignYear: string | null; campaignOpen: boolean; campaignEndDate: string | null },
  hasActivePermit = false
): HunterDossierVerification {
  const ctx = campaignCtx ?? {
    campaignYear: String(new Date().getFullYear()),
    campaignOpen: true,
    campaignEndDate: null,
  };
  const autoValid = hasActivePermit && ctx.campaignOpen;
  return {
    hunterId,
    status: autoValid ? 'validated' : 'pending',
    invalidatedDocs: [],
    reason: null,
    reviewedBy: null,
    reviewedAt: null,
    updatedAt: null,
    campaignYear: ctx.campaignYear,
    campaignOpen: ctx.campaignOpen,
    campaignEndDate: ctx.campaignEndDate,
    validatedByActivePermit: autoValid,
    expiredForNewCampaign: false,
  };
}

async function getActivePermitHunterIds(hunterId?: number): Promise<Set<number>> {
  try {
    const res: any = hunterId
      ? await db.execute(sql`
          SELECT DISTINCT hunter_id
          FROM permits
          WHERE hunter_id = ${hunterId}
            AND status = 'active'
            AND expiry_date >= CURRENT_DATE
        ` as any)
      : await db.execute(sql`
          SELECT DISTINCT hunter_id
          FROM permits
          WHERE status = 'active'
            AND expiry_date >= CURRENT_DATE
        ` as any);
    const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
    return new Set(rows.map((r) => Number(r.hunter_id)).filter((n) => Number.isFinite(n)));
  } catch (err) {
    console.warn('[hunterDossierVerification] getActivePermitHunterIds warning:', err);
    return new Set();
  }
}

export async function getHunterDossierVerification(hunterId: number): Promise<HunterDossierVerification> {
  await ensureHunterDossierVerificationTable();
  const [res, campaignCtx, activePermitHunters] = await Promise.all([
    db.execute(sql`
      SELECT hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at
      FROM hunter_dossier_verifications
      WHERE hunter_id = ${hunterId}
      LIMIT 1
    ` as any),
    getCurrentCampaignContext(),
    getActivePermitHunterIds(hunterId),
  ]);
  const rows: any[] = Array.isArray(res) ? res : ((res as any)?.rows || []);
  const hasActivePermit = activePermitHunters.has(Number(hunterId));
  if (!rows.length) return defaultVerification(hunterId, campaignCtx, hasActivePermit);
  return parseRow(rows[0], campaignCtx, hasActivePermit);
}

export async function getAllHunterDossierVerifications(): Promise<Map<number, HunterDossierVerification>> {
  await ensureHunterDossierVerificationTable();
  const [res, campaignCtx, activePermitHunters] = await Promise.all([
    db.execute(sql`
      SELECT hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at
      FROM hunter_dossier_verifications
    ` as any),
    getCurrentCampaignContext(),
    getActivePermitHunterIds(),
  ]);
  const rows: any[] = Array.isArray(res) ? res : ((res as any)?.rows || []);
  const map = new Map<number, HunterDossierVerification>();
  for (const r of rows) {
    if (r?.hunter_id != null) {
      const hid = Number(r.hunter_id);
      map.set(hid, parseRow(r, campaignCtx, activePermitHunters.has(hid)));
    }
  }
  // Pour les chasseurs ayant déjà un permis actif sans entrée explicite dans hunter_dossier_verifications
  for (const hid of activePermitHunters) {
    if (!map.has(hid)) {
      map.set(hid, defaultVerification(hid, campaignCtx, true));
    }
  }
  return map;
}

export async function validateHunterDossier(
  hunterId: number,
  reviewerUserId: number,
  note?: string | null
): Promise<HunterDossierVerification> {
  await ensureHunterDossierVerificationTable();
  const campaignCtx = await getCurrentCampaignContext();
  const cleanNote = note && note.trim() ? note.trim() : null;
  const res: any = await db.execute(sql`
    INSERT INTO hunter_dossier_verifications (hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at)
    VALUES (${hunterId}, 'validated', '[]'::jsonb, ${cleanNote}, ${reviewerUserId}, NOW(), ${campaignCtx.campaignYear}, NOW())
    ON CONFLICT (hunter_id) DO UPDATE SET
      status = 'validated',
      invalidated_docs = '[]'::jsonb,
      reason = ${cleanNote},
      reviewed_by = ${reviewerUserId},
      reviewed_at = NOW(),
      campaign_year = ${campaignCtx.campaignYear},
      updated_at = NOW()
    RETURNING hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at
  ` as any);
  const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
  return rows.length
    ? parseRow(rows[0], campaignCtx, false)
    : { ...defaultVerification(hunterId, campaignCtx), status: 'validated' };
}

export async function invalidateHunterDossier(
  hunterId: number,
  reviewerUserId: number,
  documentCodes: string[],
  reason: string
): Promise<HunterDossierVerification> {
  await ensureHunterDossierVerificationTable();
  const campaignCtx = await getCurrentCampaignContext();
  const normalized = Array.from(
    new Set(documentCodes.map(normalizeDocCode).filter((c): c is string => Boolean(c)))
  );
  if (normalized.length === 0) {
    throw new Error('Veuillez sélectionner au moins une pièce à invalider.');
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Veuillez indiquer le motif de l\'invalidation pour informer le chasseur.');
  }
  const jsonPayload = JSON.stringify(normalized);
  const res: any = await db.execute(sql`
    INSERT INTO hunter_dossier_verifications (hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at)
    VALUES (${hunterId}, 'rejected', ${jsonPayload}::jsonb, ${cleanReason}, ${reviewerUserId}, NOW(), ${campaignCtx.campaignYear}, NOW())
    ON CONFLICT (hunter_id) DO UPDATE SET
      status = 'rejected',
      invalidated_docs = ${jsonPayload}::jsonb,
      reason = ${cleanReason},
      reviewed_by = ${reviewerUserId},
      reviewed_at = NOW(),
      campaign_year = ${campaignCtx.campaignYear},
      updated_at = NOW()
    RETURNING hunter_id, status, invalidated_docs, reason, reviewed_by, reviewed_at, campaign_year, updated_at
  ` as any);
  const rows: any[] = Array.isArray(res) ? res : (res?.rows || []);
  return rows.length
    ? parseRow(rows[0], campaignCtx, false)
    : { ...defaultVerification(hunterId, campaignCtx), status: 'rejected', invalidatedDocs: normalized, reason: cleanReason };
}

export async function markDocumentResubmitted(hunterId: number, documentTypeOrBase: string): Promise<void> {
  try {
    const code = normalizeDocCode(documentTypeOrBase);
    if (!code) return;
    await ensureHunterDossierVerificationTable();
    const current = await getHunterDossierVerification(hunterId);
    if (current.status !== 'rejected') return;
    if (!current.invalidatedDocs.includes(code)) return;

    const remaining = current.invalidatedDocs.filter((c) => c !== code);
    const nextStatus: DossierVerificationStatus = remaining.length === 0 ? 'pending' : 'rejected';
    const nextReason = remaining.length === 0 ? null : current.reason;
    const jsonPayload = JSON.stringify(remaining);

    await db.execute(sql`
      UPDATE hunter_dossier_verifications
      SET status = ${nextStatus},
          invalidated_docs = ${jsonPayload}::jsonb,
          reason = ${nextReason},
          updated_at = NOW()
      WHERE hunter_id = ${hunterId}
    ` as any);
  } catch (err) {
    console.warn('[hunterDossierVerification] markDocumentResubmitted warning:', err);
  }
}

export async function sendDossierNotificationMessage(
  senderUserId: number,
  hunterId: number,
  subject: string,
  content: string
): Promise<{ sent: boolean; recipientUsername?: string | null }> {
  try {
    const linkedUser: any = await storage.getUserByHunterId(hunterId);
    if (!linkedUser?.id) {
      return { sent: false };
    }
    const domaineRes: any = await db.execute(sql`SELECT id FROM domaines WHERE nom_domaine = 'CHASSE' LIMIT 1` as any);
    const domaineRows: any[] = Array.isArray(domaineRes) ? domaineRes : (domaineRes?.rows || []);
    const domaineId = domaineRows.length > 0 ? Number(domaineRows[0].id) : undefined;

    await storage.createMessage({
      senderId: senderUserId,
      recipientId: Number(linkedUser.id),
      subject,
      content,
      type: 'standard',
      ...(domaineId ? { domaineId } : {}),
    } as any);

    return { sent: true, recipientUsername: linkedUser.username ?? null };
  } catch (err) {
    console.warn('[hunterDossierVerification] sendDossierNotificationMessage warning:', err);
    return { sent: false };
  }
}
