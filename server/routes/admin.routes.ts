import { Router } from 'express';
import { isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { checkDomain } from './middlewares/domain.middleware.js';

const router = Router();

// Toutes les routes admin sont spécifiques au domaine CHASSE
router.use(isAuthenticated, isAdminAgentOrSubAgent as any, checkDomain('CHASSE'));

// Récupérer les profils chasseurs, avec filtres optionnels par région/zone
router.get('/hunter-profiles', async (req, res) => {
  try {
    const region = typeof req.query.region === 'string' ? req.query.region : undefined;
    const zone = typeof req.query.zone === 'string' ? req.query.zone : undefined;

    // Récupérer tous les chasseurs, puis filtrer côté serveur si demandé
    const hunters = await storage.getAllHunters();
    const filtered = hunters.filter((h: any) => {
      if (region && String(h.region || '').toLowerCase() !== String(region).toLowerCase()) return false;
      if (zone && String((h.zone || h.departement || '')).toLowerCase() !== String(zone).toLowerCase()) return false;
      return true;
    });

    // Mapper vers le format attendu par le frontend
    const result = await Promise.all(filtered.map(async (h: any) => {
      const linkedUser = await storage.getUserByHunterId(h.id);
      return {
        user: linkedUser ? { username: linkedUser.username, email: linkedUser.email } : null,
        hunter: { firstName: h.firstName, lastName: h.lastName, id: h.id },
        region: h.region || null,
        zone: (h.zone ?? h.departement) || null,
      };
    }));

    return res.json({ ok: true, data: result });
  } catch (err: any) {
    console.error('[admin] GET /hunter-profiles error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

// Associer un profil chasseur à un utilisateur
router.post('/link-hunter-profile', async (req, res) => {
  try {
    const { userId, hunterId } = req.body || {};
    if (!userId || !hunterId) {
      return res.status(400).json({ ok: false, error: 'userId et hunterId sont requis' });
    }

    const updated = await storage.assignHunterToUser(Number(userId), Number(hunterId));
    if (!updated) {
      return res.status(404).json({ ok: false, error: "Utilisateur introuvable" });
    }
    return res.json({ ok: true, data: { id: updated.id, username: updated.username, hunterId: updated.hunterId } });
  } catch (err: any) {
    console.error('[admin] POST /link-hunter-profile error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur' });
  }
});

export default router;
