import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { users } from '../../shared/schema.js';
import { db } from '../db.js';
import { isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { storage } from '../storage.js';
import crypto from 'crypto';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { checkDomain } from './middlewares/domain.middleware.js';
import {
  addTerritoryAutoValidationRule,
  AutoValidationMode,
  defaultVerification,
  deleteAutoValidationRule,
  getAllHunterDossierVerifications,
  getAutoValidationConfig,
  HUNTER_DOC_LABELS,
  invalidateHunterDossier,
  sendDossierNotificationMessage,
  setAgentAutoValidationRule,
  setAutoValidationMode,
  toggleAutoValidationRule,
  validateHunterDossier,
} from '../services/hunterDossierVerification.js';

function isStrictSuperAdmin(req: any): boolean {
  const u = req?.user;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  return Boolean(u.isSuperAdmin === true || role === 'superadmin' || role === 'super_admin');
}

const router = Router();

// Toutes les routes admin sont spécifiques au domaine CHASSE (SuperAdmin contourne checkDomain)
router.use(isAuthenticated, isAdminAgentOrSubAgent as any, checkDomain('CHASSE'));

const HUNTER_DOC_DEFS = [
  { code: 'idCardDocument', label: "Pièce d'identité", dataCol: 'has_id_card', nameCol: 'id_card_name', expiryCol: 'id_card_expiry_date' },
  { code: 'weaponPermit', label: "Permis de Port d'Arme", dataCol: 'has_weapon_permit', nameCol: 'weapon_permit_name', expiryCol: 'weapon_permit_expiry_date' },
  { code: 'hunterPhoto', label: 'Photo du Chasseur', dataCol: 'has_hunter_photo', nameCol: 'hunter_photo_name', expiryCol: null },
  { code: 'treasuryStamp', label: 'Timbre Impôt', dataCol: 'has_treasury_stamp', nameCol: 'treasury_stamp_name', expiryCol: 'treasury_stamp_expiry_date' },
  { code: 'weaponReceipt', label: "Quittance de l'Arme par le Trésor", dataCol: 'has_weapon_receipt', nameCol: 'weapon_receipt_name', expiryCol: 'weapon_receipt_expiry_date' },
  { code: 'insurance', label: 'Assurance', dataCol: 'has_insurance', nameCol: 'insurance_name', expiryCol: 'insurance_expiry_date' },
  { code: 'moralCertificate', label: 'Club de Tir (carte) / ou Justificatif', dataCol: 'has_moral_certificate', nameCol: 'moral_certificate_name', expiryCol: null },
] as const;

function computeDocStatus(present: boolean, expiryDate?: string | null): 'missing' | 'valid' | 'expired' {
  if (!present) return 'missing';
  if (!expiryDate) return 'valid';
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return 'valid';
  return exp.getTime() < Date.now() ? 'expired' : 'valid';
}

// Récupérer les profils chasseurs avec statut du compte utilisateur et remplissage des documents
router.get('/hunter-profiles', async (req, res) => {
  try {
    const region = typeof req.query.region === 'string' ? req.query.region : undefined;
    const zone = typeof req.query.zone === 'string' ? req.query.zone : undefined;

    const hunters = await storage.getAllHunters();
    const filtered = hunters.filter((h: any) => {
      if (region && String(h.region || '').toLowerCase() !== String(region).toLowerCase()) return false;
      if (zone && String((h.zone || h.departement || '')).toLowerCase() !== String(zone).toLowerCase()) return false;
      return true;
    });

    // Charger en un seul appel l'état de présence de tous les documents (sans charger les binaires bytea)
    const attRowsRaw: any = await db.execute(sql`
      SELECT
        hunter_id,
        (id_card_data IS NOT NULL) AS has_id_card,
        id_card_name,
        id_card_expiry_date,
        (weapon_permit_data IS NOT NULL) AS has_weapon_permit,
        weapon_permit_name,
        weapon_permit_expiry_date,
        (hunter_photo_data IS NOT NULL) AS has_hunter_photo,
        hunter_photo_name,
        (treasury_stamp_data IS NOT NULL) AS has_treasury_stamp,
        treasury_stamp_name,
        treasury_stamp_expiry_date,
        (weapon_receipt_data IS NOT NULL) AS has_weapon_receipt,
        weapon_receipt_name,
        weapon_receipt_expiry_date,
        (insurance_data IS NOT NULL) AS has_insurance,
        insurance_name,
        insurance_expiry_date,
        (moral_certificate_data IS NOT NULL) AS has_moral_certificate,
        moral_certificate_name,
        updated_at
      FROM hunter_attachments
    ` as any);
    const attList: any[] = Array.isArray(attRowsRaw) ? attRowsRaw : (attRowsRaw?.rows || []);
    const attByHunterId = new Map<number, any>();
    for (const r of attList) {
      if (r?.hunter_id != null) attByHunterId.set(Number(r.hunter_id), r);
    }

    const verifByHunterId = await getAllHunterDossierVerifications();

    const result = await Promise.all(filtered.map(async (h: any) => {
      const linkedUser: any = await storage.getUserByHunterId(h.id);
      const att = attByHunterId.get(Number(h.id));
      const verification = verifByHunterId.get(Number(h.id)) ?? defaultVerification(Number(h.id));

      const documents = HUNTER_DOC_DEFS.map((def) => {
        const present = Boolean(att?.[def.dataCol]);
        const expiryDate = def.expiryCol ? (att?.[def.expiryCol] ?? null) : null;
        const invalidated = verification.invalidatedDocs.includes(def.code);
        return {
          code: def.code,
          label: def.label,
          present,
          name: present ? (att?.[def.nameCol] ?? null) : null,
          expiryDate,
          status: computeDocStatus(present, expiryDate),
          invalidated,
        };
      });

      const documentsCompleted = documents.filter((d) => d.present).length;
      const documentsTotal = documents.length;
      const documentsPercent = Math.round((documentsCompleted / documentsTotal) * 100);

      const isUserActive = linkedUser
        ? (linkedUser.isActive !== false && linkedUser.isSuspended !== true)
        : false;

      return {
        user: linkedUser
          ? {
              id: linkedUser.id,
              username: linkedUser.username,
              email: linkedUser.email,
              firstName: linkedUser.firstName ?? null,
              lastName: linkedUser.lastName ?? null,
              phone: linkedUser.phone ?? null,
              isActive: linkedUser.isActive !== false,
              isSuspended: Boolean(linkedUser.isSuspended),
              accessActive: isUserActive,
            }
          : null,
        hunter: {
          id: h.id,
          firstName: h.firstName,
          lastName: h.lastName,
          phone: h.phone || null,
          idNumber: h.idNumber || null,
          category: h.category || null,
          isActive: h.isActive !== false,
        },
        region: h.region || null,
        zone: (h.zone ?? h.departement) || null,
        documents,
        documentsCompleted,
        documentsTotal,
        documentsPercent,
        documentsUpdatedAt: att?.updated_at ?? null,
        verification,
      };
    }));

    return res.json({ ok: true, data: result });
  } catch (err: any) {
    console.error('[admin] GET /hunter-profiles error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Liste des comptes utilisateurs chasseurs disponibles pour association (sans exposer d'IDs à saisir)
router.get('/available-hunter-users', async (_req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    const candidates = (allUsers || [])
      .filter((u: any) => u.role === 'hunter')
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        firstName: u.firstName || null,
        lastName: u.lastName || null,
        phone: u.phone || null,
        hunterId: u.hunterId ?? null,
        isLinked: u.hunterId != null,
        isActive: u.isActive !== false,
        isSuspended: Boolean(u.isSuspended),
        accessActive: u.isActive !== false && !u.isSuspended,
      }));
    return res.json({ ok: true, data: candidates });
  } catch (err: any) {
    console.error('[admin] GET /available-hunter-users error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Associer un profil chasseur à un utilisateur
router.post('/link-hunter-profile', async (req, res) => {
  try {
    const { userId, hunterId } = req.body || {};
    if (!userId || !hunterId) {
      return res.status(400).json({ ok: false, error: 'Veuillez sélectionner un compte utilisateur et un profil chasseur' });
    }

    const targetUser = await storage.getUser(Number(userId));
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'Compte utilisateur introuvable' });
    }
    if ((targetUser as any).isSuspended || (targetUser as any).isActive === false) {
      return res.status(400).json({ ok: false, error: 'Impossible d\'associer un compte désactivé ou suspendu' });
    }

    // Détacher un éventuel autre compte précédemment lié à ce chasseur
    const existingLinked = await storage.getUserByHunterId(Number(hunterId));
    if (existingLinked && existingLinked.id !== Number(userId)) {
      await db.update(users).set({ hunterId: null } as any).where(eq(users.id, existingLinked.id));
    }

    const updated = await storage.assignHunterToUser(Number(userId), Number(hunterId));
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });
    }
    return res.json({ ok: true, data: { id: updated.id, username: updated.username, hunterId: updated.hunterId } });
  } catch (err: any) {
    console.error('[admin] POST /link-hunter-profile error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Dissocier un chasseur de son compte utilisateur (et optionnellement refuser/bloquer l'accès au compte)
router.post('/unlink-hunter-profile', async (req, res) => {
  try {
    const { userId, hunterId, suspendAccount } = req.body || {};
    let targetUserId = userId ? Number(userId) : null;

    if (!targetUserId && hunterId) {
      const linked = await storage.getUserByHunterId(Number(hunterId));
      targetUserId = linked?.id ?? null;
    }

    if (!targetUserId) {
      return res.status(400).json({ ok: false, error: 'Aucun compte associé trouvé pour ce chasseur' });
    }

    const updatePayload: any = { hunterId: null };
    if (suspendAccount === true) {
      updatePayload.isSuspended = true;
      updatePayload.isActive = false;
    }

    const [updated] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, targetUserId))
      .returning();

    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Compte utilisateur introuvable' });
    }

    if (suspendAccount === true) {
      try {
        await db.execute(sql`
          UPDATE user_domains SET active = FALSE WHERE user_id = ${targetUserId} AND domain = 'CHASSE'
        ` as any);
      } catch (e) {
        console.warn('[admin] unlink domain deactivation warning:', e);
      }
    }

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        username: updated.username,
        hunterId: updated.hunterId,
        isSuspended: updated.isSuspended,
        isActive: updated.isActive,
      },
    });
  } catch (err: any) {
    console.error('[admin] POST /unlink-hunter-profile error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Valider le dossier d'un chasseur (débloque la demande de permis + envoie un message au chasseur)
router.post('/hunter-profiles/:hunterId/validate', async (req, res) => {
  try {
    const hunterIdNum = Number(req.params.hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ ok: false, error: 'Identifiant chasseur invalide' });
    }
    const reviewerId = Number((req.user as any)?.id || 0);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    const verification = await validateHunterDossier(hunterIdNum, reviewerId, note || null);

    const messageBody = [
      'Bonjour,',
      '',
      "Votre dossier et vos pièces justificatives ont été vérifiés et validés par l'administration.",
      'Vous pouvez désormais effectuer votre demande de permis de chasse depuis votre espace chasseur.',
      ...(note ? ['', `Note de l'administration : ${note}`] : []),
    ].join('\n');

    const notif = await sendDossierNotificationMessage(
      reviewerId,
      hunterIdNum,
      'Dossier validé — Demande de permis disponible',
      messageBody
    );

    return res.json({
      ok: true,
      data: verification,
      messageSent: notif.sent,
      recipientUsername: notif.recipientUsername ?? null,
    });
  } catch (err: any) {
    console.error('[admin] POST /hunter-profiles/:hunterId/validate error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur lors de la validation du dossier' });
  }
});

// Invalider une, plusieurs ou l'intégralité des pièces d'un dossier chasseur avec message explicatif
router.post('/hunter-profiles/:hunterId/invalidate', async (req, res) => {
  try {
    const hunterIdNum = Number(req.params.hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ ok: false, error: 'Identifiant chasseur invalide' });
    }
    const reviewerId = Number((req.user as any)?.id || 0);
    const documentCodes = Array.isArray(req.body?.documentCodes) ? req.body.documentCodes : [];
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    if (documentCodes.length === 0) {
      return res.status(400).json({ ok: false, error: 'Veuillez sélectionner au moins une pièce à invalider.' });
    }
    if (!reason) {
      return res.status(400).json({ ok: false, error: 'Veuillez saisir le motif / message à envoyer au chasseur.' });
    }

    const verification = await invalidateHunterDossier(hunterIdNum, reviewerId, documentCodes, reason);

    const docLabels = verification.invalidatedDocs.map((code) => `• ${HUNTER_DOC_LABELS[code] || code}`);
    const messageBody = [
      'Bonjour,',
      '',
      `Lors de la vérification de votre dossier, ${verification.invalidatedDocs.length > 1 ? 'les pièces suivantes ont été invalidées' : 'la pièce suivante a été invalidée'} :`,
      ...docLabels,
      '',
      "Motif indiqué par l'administration :",
      reason,
      '',
      'Veuillez corriger et téléverser à nouveau ces pièces dans votre espace « Documents » afin de permettre la validation de votre dossier et l\'accès à la demande de permis.',
    ].join('\n');

    const notif = await sendDossierNotificationMessage(
      reviewerId,
      hunterIdNum,
      'Pièce(s) à corriger dans votre dossier chasseur',
      messageBody
    );

    return res.json({
      ok: true,
      data: verification,
      messageSent: notif.sent,
      recipientUsername: notif.recipientUsername ?? null,
    });
  } catch (err: any) {
    console.error('[admin] POST /hunter-profiles/:hunterId/invalidate error:', err);
    return res.status(400).json({ ok: false, error: err?.message || "Erreur lors de l'invalidation du dossier" });
  }
});

// Couper ou rétablir l'accès au compte utilisateur d'un chasseur (sans jamais associer un autre compte)
router.post('/hunter-profiles/:hunterId/toggle-access', async (req, res) => {
  try {
    const hunterIdNum = Number(req.params.hunterId);
    const active = Boolean(req.body?.active);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ ok: false, error: 'Identifiant chasseur invalide' });
    }

    const linkedUser: any = await storage.getUserByHunterId(hunterIdNum);
    if (!linkedUser?.id) {
      return res.status(404).json({ ok: false, error: 'Aucun compte utilisateur trouvé pour ce chasseur' });
    }

    const [updated] = await db
      .update(users)
      .set({
        isActive: active,
        isSuspended: !active,
      } as any)
      .where(eq(users.id, Number(linkedUser.id)))
      .returning();

    try {
      await db.execute(sql`
        UPDATE user_domains SET active = ${active} WHERE user_id = ${Number(linkedUser.id)} AND domain = 'CHASSE'
      ` as any);
    } catch (e) {
      console.warn('[admin] toggle-access domain update warning:', e);
    }

    return res.json({
      ok: true,
      data: {
        userId: updated?.id ?? linkedUser.id,
        username: updated?.username ?? linkedUser.username,
        accessActive: active,
      },
    });
  } catch (err: any) {
    console.error('[admin] POST /hunter-profiles/:hunterId/toggle-access error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Créer un accès dédié (username + chasse000) pour un ancien profil chasseur sans compte utilisateur
router.post('/hunter-profiles/:hunterId/create-access', async (req, res) => {
  try {
    const hunterIdNum = Number(req.params.hunterId);
    if (!Number.isInteger(hunterIdNum) || hunterIdNum <= 0) {
      return res.status(400).json({ ok: false, error: 'Identifiant chasseur invalide' });
    }

    const alreadyLinked = await storage.getUserByHunterId(hunterIdNum);
    if (alreadyLinked) {
      return res.status(400).json({ ok: false, error: 'Ce chasseur possède déjà un compte utilisateur.' });
    }

    const hunter = await storage.getHunter(hunterIdNum);
    if (!hunter) {
      return res.status(404).json({ ok: false, error: 'Profil chasseur introuvable' });
    }

    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().replace(/\s+/g, '') : '';
    const phoneDigits = String((hunter as any).phone || '').replace(/[^0-9]/g, '');
    const idDigits = String((hunter as any).idNumber || '').replace(/\s+/g, '');
    const chosenUsername = rawUsername || (phoneDigits.length >= 6 ? phoneDigits : idDigits);

    if (!chosenUsername || chosenUsername.length < 3) {
      return res.status(400).json({ ok: false, error: "Veuillez renseigner un nom d'utilisateur (au moins 3 caractères)." });
    }

    const existing = await storage.getUserByUsername(chosenUsername);
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: `Le nom d'utilisateur « ${chosenUsername} » est déjà utilisé. Choisissez-en un autre.`,
      });
    }

    const generatedPassword = 'chasse000';
    const generatedEmail = `${chosenUsername.toLowerCase()}@scodi.sn`;

    const newUser = await storage.createUser({
      publicId: crypto.randomUUID(),
      username: chosenUsername,
      password: generatedPassword,
      email: generatedEmail,
      firstName: String((hunter as any).firstName || ''),
      lastName: String((hunter as any).lastName || ''),
      phone: String((hunter as any).phone || ''),
      role: 'hunter',
      hunterId: hunterIdNum,
    } as any);

    await storage.assignHunterToUser(newUser.id, hunterIdNum);

    return res.status(201).json({
      ok: true,
      credentials: {
        username: chosenUsername,
        password: generatedPassword,
      },
      data: {
        userId: newUser.id,
        username: newUser.username,
      },
    });
  } catch (err: any) {
    console.error('[admin] POST /hunter-profiles/:hunterId/create-access error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur lors de la création du compte' });
  }
});

// ── Règles de délégation d'auto-validation (compétence exclusive SuperAdmin) ──
router.get('/autovalidation-rules', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const config = await getAutoValidationConfig();
    const allUsers = await storage.getAllUsers();
    const eligibleRoles = new Set(['admin', 'agent', 'sub-agent', 'agent-regional', 'agent-departemental']);
    const agents = (allUsers || [])
      .filter((u: any) => eligibleRoles.has(String(u.role || '').toLowerCase()) && u.isActive !== false && !u.isSuspended)
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        role: u.role,
        region: u.region || null,
        departement: u.departement || null,
        zone: u.zone || null,
        autoValidateEnabled: config.agentRules.some((r) => r.userId === Number(u.id) && r.enabled),
      }))
      .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    return res.json({
      ok: true,
      data: {
        mode: config.mode,
        territoryRules: config.territoryRules,
        agentRules: config.agentRules,
        agents,
      },
    });
  } catch (err: any) {
    console.error('[admin] GET /autovalidation-rules error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

router.put('/autovalidation-rules/mode', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const rawMode = String(req.body?.mode || '');
    if (!['manual', 'rules', 'all'].includes(rawMode)) {
      return res.status(400).json({ ok: false, error: 'Mode invalide' });
    }
    const mode = await setAutoValidationMode(rawMode as AutoValidationMode, Number((req.user as any)?.id || 0));
    return res.json({ ok: true, data: { mode } });
  } catch (err: any) {
    console.error('[admin] PUT /autovalidation-rules/mode error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

router.post('/autovalidation-rules/territory', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const { region, departement, commune } = req.body || {};
    const rule = await addTerritoryAutoValidationRule(
      { region, departement, commune },
      Number((req.user as any)?.id || 0)
    );
    return res.status(201).json({ ok: true, data: rule });
  } catch (err: any) {
    console.error('[admin] POST /autovalidation-rules/territory error:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

router.post('/autovalidation-rules/agent', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const userId = Number(req.body?.userId);
    const enabled = Boolean(req.body?.enabled);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: 'Agent invalide' });
    }
    const rule = await setAgentAutoValidationRule(userId, enabled, Number((req.user as any)?.id || 0));
    return res.json({ ok: true, data: rule });
  } catch (err: any) {
    console.error('[admin] POST /autovalidation-rules/agent error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

router.patch('/autovalidation-rules/:id', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const ruleId = Number(req.params.id);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({ ok: false, error: 'Règle invalide' });
    }
    await toggleAutoValidationRule(ruleId, Boolean(req.body?.enabled));
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[admin] PATCH /autovalidation-rules/:id error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

router.delete('/autovalidation-rules/:id', async (req, res) => {
  try {
    if (!isStrictSuperAdmin(req)) {
      return res.status(403).json({ ok: false, error: 'Réservé exclusivement au SuperAdmin' });
    }
    const ruleId = Number(req.params.id);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return res.status(400).json({ ok: false, error: 'Règle invalide' });
    }
    await deleteAutoValidationRule(ruleId);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[admin] DELETE /autovalidation-rules/:id error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

export default router;
