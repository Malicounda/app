import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { users } from '../../shared/schema.js';
import { db } from '../db.js';
import { isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { checkDomain } from './middlewares/domain.middleware.js';

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

    const result = await Promise.all(filtered.map(async (h: any) => {
      const linkedUser: any = await storage.getUserByHunterId(h.id);
      const att = attByHunterId.get(Number(h.id));

      const documents = HUNTER_DOC_DEFS.map((def) => {
        const present = Boolean(att?.[def.dataCol]);
        const expiryDate = def.expiryCol ? (att?.[def.expiryCol] ?? null) : null;
        return {
          code: def.code,
          label: def.label,
          present,
          name: present ? (att?.[def.nameCol] ?? null) : null,
          expiryDate,
          status: computeDocStatus(present, expiryDate),
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

export default router;
