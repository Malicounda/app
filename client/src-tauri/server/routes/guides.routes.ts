import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import { db } from '../db.js';
import { eq, like, or, and, sql } from 'drizzle-orm';
import { huntingGuides, users, hunters, guideHunterAssociations } from '../../shared/dist/schema.js';

const router = Router();

// Récupérer tous les guides
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Si agent régional connecté, filtrer par sa région
    const requester: any = (req as any).user || (req as any).session?.user;
    const isRegionalAgent = requester?.role === 'agent' && requester?.region;
    const roleRaw: string = (requester?.role || '').toString();
    const roleNormalized = roleRaw.replace(/[_\s]/g, '-').toLowerCase();
    let sectorDepartement: string | undefined = (requester?.departement || requester?.zone) ? String(requester?.departement || requester?.zone) : undefined;
    let isSectorAgent = ['sub-agent','sector-agent','agent-secteur'].includes(roleNormalized);
    // Si agent de secteur sans departement/zone dans le token/session, tenter de le récupérer depuis la DB
    if (isSectorAgent && !sectorDepartement && requester?.id) {
      try {
        const u = await db.select({
          departement: users.departement,
          zone: users.departement
        }).from(users).where(eq(users.id, requester.id)).limit(1);
        sectorDepartement = (u[0]?.departement || u[0]?.zone || sectorDepartement) as string | undefined;
      } catch {}
    }
    // Normaliser le département: retirer préfixe "Secteur ", trim
    if (sectorDepartement) {
      sectorDepartement = sectorDepartement.replace(/^Secteur\s+/i, '').trim();
    }
    // Si sub-agent mais pas de département identifiable, bloquer l'accès global (éviter fuite de données)
    if (isSectorAgent && !sectorDepartement) {
      return res.status(403).json({ message: "Département non défini pour cet agent de secteur. Contactez un administrateur." });
    }

    // Utiliser une jointure pour récupérer les informations utilisateur
    const baseSelect = await db.select({
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username
    })
    .from(huntingGuides)
    .leftJoin(users, eq(huntingGuides.userId, users.id))
    .where(
      isRegionalAgent
        ? eq(huntingGuides.region, requester.region)
        : (isSectorAgent && sectorDepartement
            ? sql`LOWER(${huntingGuides.departement}) = LOWER(${sectorDepartement}) OR LOWER(${huntingGuides.departement}) = LOWER(${"Secteur " + sectorDepartement})`
            : sql`true`)
    )
    .orderBy(huntingGuides.lastName, huntingGuides.firstName);
    
    res.json(baseSelect);
  } catch (error) {
    console.error("Erreur lors de la récupération des guides:", error);
    res.status(500).json({ message: "Échec de la récupération des guides" });
  }
});

// Récupérer les guides par département (pour agents de secteur)
router.get('/by-departement/:departement', isAuthenticated, async (req, res) => {
  try {
    const { departement } = req.params;
    const requester: any = (req as any).user || (req as any).session?.user;
    const isSectorAgent = requester?.role === 'sub-agent';
    // Si agent secteur, limiter au propre département
    if (isSectorAgent) {
      const allowedDept = requester?.departement || requester?.zone;
      if (allowedDept && allowedDept !== departement) {
        return res.status(403).json({ message: "Interdit: vous ne pouvez consulter que votre département." });
      }
    }

    const rows = await db.select({
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username
    })
    .from(huntingGuides)
    .leftJoin(users, eq(huntingGuides.userId, users.id))
    .where(sql`LOWER(${huntingGuides.departement}) = LOWER(${departement}) OR LOWER(${huntingGuides.departement}) = LOWER(${"Secteur " + departement})`)
    .orderBy(huntingGuides.lastName, huntingGuides.firstName);

    res.json(rows);
  } catch (error) {
    console.error(`Erreur lors de la récupération des guides pour le département ${req.params.departement}:`, error);
    res.status(500).json({ 
      message: `Erreur lors de la récupération des guides pour le département ${req.params.departement}` 
    });
  }
});

// Supprimer définitivement un guide
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Récupérer le guide pour connaître un éventuel userId
    const guide = await db.select().from(huntingGuides).where(eq(huntingGuides.id, guideId)).limit(1);
    if (guide.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    // Supprimer le guide
    await db.delete(huntingGuides).where(eq(huntingGuides.id, guideId));

    // Optionnel: désactiver l'utilisateur lié (au lieu de supprimer définitivement)
    if (guide[0].userId) {
      await db.update(users).set({ isActive: false }).where(eq(users.id, guide[0].userId));
    }

    res.json({ message: 'Guide supprimé avec succès', id: guideId });
  } catch (error) {
    console.error('Erreur lors de la suppression du guide:', error);
    res.status(500).json({ message: "Échec de la suppression du guide" });
  }
});

// Créer un nouveau guide
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { firstName, lastName, phone, zone, region, idNumber, photo, username, password } = req.body;
    const departement = (req.body.departement ?? zone) as string | undefined;
    
    console.log("BODY REÇU POUR CREATION GUIDE:", req.body);
    
    // Contraindre la région pour les agents régionaux
    const requester: any = (req as any).user || (req as any).session?.user;
    const isRegionalAgent = requester?.role === 'agent' && requester?.region;

    // Normalisation simple
    const _firstName = typeof firstName === 'string' ? firstName.trim() : '';
    const _lastName = typeof lastName === 'string' ? lastName.trim() : '';
    const _phone = typeof phone === 'string' ? phone.trim() : '';
    const _region = isRegionalAgent ? String(requester.region).trim() : (typeof region === 'string' ? region.trim() : '');
    const _departement = typeof departement === 'string' ? departement.trim() : '';
    const _idNumber = typeof idNumber === 'string' ? idNumber.trim() : '';
    const _username = typeof username === 'string' ? username.trim() : '';
    const _password = typeof password === 'string' ? password : '';

    // Vérifications explicites des champs requis
    if (!_firstName) return res.status(400).json({ message: "Le prénom est requis." });
    if (!_lastName) return res.status(400).json({ message: "Le nom est requis." });
    if (!_phone) return res.status(400).json({ message: "Le numéro de téléphone est requis." });
    if (!_region) return res.status(400).json({ message: "La région est requise." });
    if (!_departement) return res.status(400).json({ message: "Le département est requis (sélectionnez une zone)." });
    if (!_idNumber) return res.status(400).json({ message: "Le numéro de pièce d'identité est requis." });
    if (!_username) return res.status(400).json({ message: "Le nom d'utilisateur est requis." });
    if (!_password || _password.length < 6) return res.status(400).json({ message: "Le mot de passe est requis et doit contenir au moins 6 caractères." });
    
    // 1. D'abord, créer un utilisateur avec le rôle "hunting-guide"
    // IMPORTANT: la table users n'a pas de colonne 'zone'. On ne doit pas l'insérer.
    const [newUser] = await db.insert(users)
      .values({
        username: _username,
        password: _password, // TODO: hasher le mot de passe
        email: _username + "@guide.scodippc.com", // Email généré par défaut
        firstName: _firstName,
        lastName: _lastName,
        phone: _phone,
        region: _region,
        role: 'hunting-guide',
        isActive: true
      })
      .returning();
    
    // 2. Ensuite, créer le guide et lier l'utilisateur
    const [newGuide] = await db.insert(huntingGuides)
      .values({
        firstName: _firstName,
        lastName: _lastName,
        phone: _phone,
        departement: _departement,
        region: _region,
        idNumber: _idNumber,
        photo,
        userId: newUser.id, // Lier le guide à l'utilisateur créé
        isActive: true,
        createdAt: new Date()
      })
      .returning();

    // Retourner un objet combiné avec les informations du guide et de l'utilisateur
    res.status(201).json({...newGuide, username: newUser.username});
  } catch (error) {
    console.error("Erreur lors de la création du guide:", error);
    const anyErr: any = error;
    let friendly = "Échec de la création du guide";
    let details = anyErr?.message || 'Une erreur est survenue';

    // Amélioration des messages connus (Postgres / Drizzle)
    const code = anyErr?.code || anyErr?.original?.code;
    const errMsg = (anyErr?.message || "").toLowerCase();
    const detail = (anyErr?.detail || anyErr?.original?.detail || "").toLowerCase();

    if (code === '23505' || errMsg.includes('duplicate key') || detail.includes('duplicate')) {
      // Violation d'unicité
      if (detail.includes('users_username') || errMsg.includes('username')) {
        friendly = "Nom d'utilisateur déjà utilisé. Choisissez un autre nom.";
      } else if (detail.includes('users_email') || errMsg.includes('email')) {
        friendly = "Email déjà utilisé (dérivé du nom d'utilisateur).";
      } else if (detail.includes('hunting_guides_id_number') || errMsg.includes('id_number')) {
        friendly = "Numéro de pièce d'identité déjà utilisé.";
      } else {
        friendly = "Valeur déjà utilisée pour un champ unique.";
      }
    } else if (code === '23502' || errMsg.includes('not-null') || errMsg.includes('null value in column')) {
      // Violation NOT NULL
      if (errMsg.includes('departement') || detail.includes('departement')) {
        friendly = "Le département est requis (sélectionnez une zone).";
      } else if (errMsg.includes('region') || detail.includes('region')) {
        friendly = "La région est requise.";
      } else {
        friendly = "Un champ requis est manquant.";
      }
    }

    res.status(400).json({ message: friendly, error: details });
  }
});

// Mettre à jour un guide
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const { firstName, lastName, phone, zone, region, idNumber, photo, isActive, username, password } = req.body;
    const departement = req.body.departement ?? zone;
    const requester: any = (req as any).user || (req as any).session?.user;
    const isRegionalAgent = requester?.role === 'agent' && requester?.region;
    const forcedRegion = isRegionalAgent ? String(requester.region) : undefined;
    
    // Si agent régional: vérifier que le guide appartient à sa région
    if (isRegionalAgent) {
      const existing = await db.select({ r: huntingGuides.region }).from(huntingGuides).where(eq(huntingGuides.id, guideId)).limit(1);
      const currentRegion = existing[0]?.r;
      if (currentRegion && currentRegion !== forcedRegion) {
        return res.status(403).json({ message: "Interdit: vous ne pouvez modifier que les guides de votre région." });
      }
    }
    
    // 1. D'abord, mettre à jour les informations du guide
    const [updatedGuide] = await db.update(huntingGuides)
      .set({
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
        ...(departement && { departement }),
        // Forcer la région si agent régional, sinon prendre celle envoyée
        ...((forcedRegion || region) && { region: (forcedRegion || region) }),
        ...(idNumber && { idNumber }),
        ...(photo && { photo }),
        ...(typeof isActive !== 'undefined' && { isActive })
      })
      .where(eq(huntingGuides.id, guideId))
      .returning();

    if (!updatedGuide) {
      return res.status(404).json({ message: "Guide non trouvé" });
    }

    // 2. Si le guide a un userId, mettre à jour les informations de l'utilisateur correspondant
    if (updatedGuide.userId) {
      // IMPORTANT: ne pas tenter de mettre à jour une colonne 'zone' inexistante dans users
      const userUpdates = {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
        ...(region && { region }),
        ...(username && { username }),
        ...(password && { password })
      };

      // Ne mettre à jour l'utilisateur que s'il y a des champs à mettre à jour
      if (Object.keys(userUpdates).length > 0) {
        await db.update(users)
          .set(userUpdates)
          .where(eq(users.id, updatedGuide.userId));
      }
    }

    // 3. Récupérer les informations à jour avec le username (sélection explicite des colonnes)
    const result = await db.select({
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username
    })
    .from(huntingGuides)
    .leftJoin(users, eq(huntingGuides.userId, users.id))
    .where(eq(huntingGuides.id, guideId))
    .limit(1);

    res.json(result[0] || updatedGuide);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du guide:", error);
    res.status(500).json({ message: "Échec de la mise à jour du guide" });
  }
});

// Changer le statut (activer/désactiver) d'un guide
router.patch('/:id/status', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const { isActive } = req.body as { isActive: boolean };

    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Mettre à jour le statut du guide
    const [updatedGuide] = await db
      .update(huntingGuides)
      .set({ isActive })
      .where(eq(huntingGuides.id, guideId))
      .returning();

    if (!updatedGuide) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    // Mettre à jour le statut de l'utilisateur lié si présent
    if (updatedGuide.userId) {
      await db.update(users)
        .set({ isActive })
        .where(eq(users.id, updatedGuide.userId));
    }

    // Retourner l'objet combiné avec username
    const result = await db.select({
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username,
    })
      .from(huntingGuides)
      .leftJoin(users, eq(huntingGuides.userId, users.id))
      .where(eq(huntingGuides.id, guideId))
      .limit(1);

    res.json(result[0] || updatedGuide);
  } catch (error) {
    console.error('Erreur lors du changement de statut du guide:', error);
    res.status(500).json({ message: "Échec de la modification du statut du guide" });
  }
});

// Récupérer les guides par région
router.get('/by-region/:region', isAuthenticated, async (req, res) => {
  try {
    const { region } = req.params;
    
    // Utiliser une jointure pour récupérer les informations utilisateur
    const regionGuides = await db.select({
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username
    })
    .from(huntingGuides)
    .leftJoin(users, eq(huntingGuides.userId, users.id))
    .where(eq(huntingGuides.region, region))
    .orderBy(huntingGuides.lastName, huntingGuides.firstName);
    
    res.json(regionGuides);
  } catch (error) {
    console.error(`Erreur lors de la récupération des guides pour la région ${req.params.region}:`, error);
    res.status(500).json({ 
      message: `Erreur lors de la récupération des guides pour la région ${req.params.region}` 
    });

  }
});

// Récupérer un guide par ID (guideId) ou par userId
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Sélection de base (même shape que pour la liste)
    const baseSelect = {
      id: huntingGuides.id,
      firstName: huntingGuides.firstName,
      lastName: huntingGuides.lastName,
      phone: huntingGuides.phone,
      zone: huntingGuides.departement,
      region: huntingGuides.region,
      idNumber: huntingGuides.idNumber,
      photo: huntingGuides.photo,
      isActive: huntingGuides.isActive,
      createdAt: huntingGuides.createdAt,
      userId: huntingGuides.userId,
      username: users.username,
    } as const;

    // 1) Chercher par guideId
    const byGuide = await db
      .select(baseSelect)
      .from(huntingGuides)
      .leftJoin(users, eq(huntingGuides.userId, users.id))
      .where(eq(huntingGuides.id, id))
      .limit(1);

    if (byGuide.length > 0) {
      return res.json(byGuide[0]);
    }

    // 2) Sinon, tenter par userId (compatibilité avec appel front /api/guides/${user.id})
    const byUser = await db
      .select(baseSelect)
      .from(huntingGuides)
      .leftJoin(users, eq(huntingGuides.userId, users.id))
      .where(eq(huntingGuides.userId, id))
      .limit(1);

    if (byUser.length > 0) {
      return res.json(byUser[0]);
    }

    return res.status(404).json({ message: 'Guide non trouvé' });
  } catch (error) {
    console.error('Erreur lors de la récupération du guide:', error);
    res.status(500).json({ message: "Échec de la récupération du guide" });
  }
});

// Servir la photo binaire d'un guide directement (image/png ou image/jpeg)
router.get('/:id/photo', isAuthenticated, async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // 1) Recherche par guideId
    let rows = await db
      .select({ photo: huntingGuides.photo })
      .from(huntingGuides)
      .where(eq(huntingGuides.id, id))
      .limit(1);

    // 2) Sinon, recherche par userId
    if (rows.length === 0) {
      rows = await db
        .select({ photo: huntingGuides.photo })
        .from(huntingGuides)
        .where(eq(huntingGuides.userId, id))
        .limit(1);
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    const photo: any = rows[0].photo;
    if (!photo) {
      return res.status(404).json({ message: 'Photo non disponible' });
    }

    // Convertir vers Buffer selon différents formats possibles
    let buf: Buffer | null = null;
    let hintedType: string | undefined;
    if (Buffer.isBuffer(photo)) {
      buf = photo as Buffer;
    } else if (ArrayBuffer.isView(photo)) {
      const view = photo as ArrayBufferView;
      buf = Buffer.from(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength);
    } else if (photo && typeof photo === 'object' && Array.isArray((photo as any).data)) {
      // Format { type: 'Buffer', data: [...] }
      buf = Buffer.from((photo as any).data);
    } else if (typeof photo === 'string') {
      const s = photo.trim();
      if (s.startsWith('data:')) {
        // data URL: data:image/png;base64,....
        const commaIdx = s.indexOf(',');
        if (commaIdx > 0) {
          const header = s.substring(5, commaIdx); // e.g., image/png;base64
          hintedType = header.split(';')[0];
          const b64 = s.substring(commaIdx + 1);
          buf = Buffer.from(b64, 'base64');
        }
      } else if (/^\\x[0-9a-fA-F]+$/.test(s)) {
        // Format bytea en hex de Postgres (e.g., "\\xFFD8...")
        const hex = s.slice(2);
        try {
          buf = Buffer.from(hex, 'hex');
        } catch {
          buf = null;
        }
      } else {
        // Essayer base64 brut
        try {
          buf = Buffer.from(s, 'base64');
          // Heuristique: si trop petit ou décodage invalide, considérer comme non exploitable
          if (!buf || buf.length < 16) buf = null;
        } catch {
          buf = null;
        }
      }
    }

    if (!buf) {
      return res.status(415).json({ message: 'Format de photo non supporté' });
    }

    // Détection simple du type MIME
    let contentType = hintedType || 'image/jpeg';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      contentType = 'image/png';
    } else if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
      contentType = 'image/jpeg';
    } else if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) { // 'WEBP'
      contentType = 'image/webp';
    } else if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) { // 'GIF8'
      contentType = 'image/gif';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buf.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', 'inline');
    return res.send(buf);
  } catch (error) {
    console.error('Erreur lors de la récupération de la photo du guide:', error);
    return res.status(500).json({ message: "Échec de la récupération de la photo" });
  }
});

// Associer un chasseur à un guide
router.post('/:id/associate-hunter', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const { hunterId } = req.body;

    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID de guide invalide' });
    }

    if (!hunterId) {
      return res.status(400).json({ message: 'ID de chasseur requis' });
    }

    // Vérifier que le guide existe
    const guide = await db.select().from(huntingGuides).where(eq(huntingGuides.id, guideId)).limit(1);
    if (guide.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    // Vérifier que le chasseur existe
    const hunter = await db.select().from(hunters).where(eq(hunters.id, hunterId)).limit(1);
    if (hunter.length === 0) {
      return res.status(404).json({ message: 'Chasseur non trouvé' });
    }

    // Vérifier que le chasseur a au moins un permis actif, non expiré et non épuisé (condition pour association par un guide)
    try {
      const activePermits: any[] = await db.execute(sql`
        SELECT 1 FROM permits 
        WHERE hunter_id = ${hunterId} 
          AND status = 'active' 
          AND expiry_date >= CURRENT_DATE
          AND COALESCE( (metadata->>'renewalCount')::int, COALESCE(jsonb_array_length(metadata->'renewals'), 0), 0) < 2
        LIMIT 1
      ` as any);
      if (!Array.isArray(activePermits) || activePermits.length === 0) {
        return res.status(409).json({ 
          message: "Association refusée: le chasseur ne possède aucun permis actif en cours de validité et non épuisé (renouvellements < 2)."
        });
      }
    } catch (e) {
      // En cas d'erreur DB, sécuriser en refusant l'association pour ne pas créer d'incohérences
      return res.status(500).json({ message: "Vérification des permis du chasseur impossible. Réessayez plus tard." });
    }

    // Vérifier si le chasseur est déjà associé à n'importe quel guide
    const anyActiveAssociation = await db.select({
      association: guideHunterAssociations,
      guide: {
        id: huntingGuides.id,
        firstName: huntingGuides.firstName,
        lastName: huntingGuides.lastName
      }
    })
    .from(guideHunterAssociations)
    .innerJoin(huntingGuides, eq(guideHunterAssociations.guideId, huntingGuides.id))
    .where(and(eq(guideHunterAssociations.hunterId, hunterId), eq(guideHunterAssociations.isActive, true)))
    .limit(1);

    if (anyActiveAssociation.length > 0) {
      const associatedGuide = anyActiveAssociation[0].guide;
      
      // Si le chasseur est déjà associé au guide actuel
      if (associatedGuide.id === guideId) {
        return res.status(400).json({ 
          message: 'Ce chasseur est déjà associé par vous',
          isSameGuide: true,
          guideName: `${associatedGuide.firstName} ${associatedGuide.lastName}`
        });
      }
      
      // Si le chasseur est associé à un autre guide
      return res.status(400).json({ 
        message: `Ce chasseur est déjà associé par le guide ${associatedGuide.firstName} ${associatedGuide.lastName}`,
        isSameGuide: false,
        guideName: `${associatedGuide.firstName} ${associatedGuide.lastName}`
      });
    }

    // Vérifier si l'association existe déjà avec ce guide spécifique mais est inactive
    const existingAssociation = await db.select()
      .from(guideHunterAssociations)
      .where(and(eq(guideHunterAssociations.guideId, guideId), eq(guideHunterAssociations.hunterId, hunterId)))
      .limit(1);

    if (existingAssociation.length > 0 && !existingAssociation[0].isActive) {
      // Réactiver l'association
      const [reactivatedAssociation] = await db.update(guideHunterAssociations)
        .set({ 
          isActive: true,
          associatedAt: new Date(),
          dissociatedAt: null
        })
        .where(and(eq(guideHunterAssociations.guideId, guideId), eq(guideHunterAssociations.hunterId, hunterId)))
        .returning();

      return res.status(200).json({
        message: 'Chasseur réassocié avec succès',
        association: reactivatedAssociation
      });
    }

    // Créer l'association
    const [newAssociation] = await db.insert(guideHunterAssociations)
      .values({
        guideId,
        hunterId,
        associatedAt: new Date(),
        isActive: true
      })
      .returning();

    res.status(201).json({
      message: 'Chasseur associé avec succès',
      association: newAssociation
    });
  } catch (error) {
    console.error('Erreur lors de l\'association du chasseur:', error);
    res.status(500).json({ message: 'Échec de l\'association du chasseur' });
  }
});

// Récupérer les chasseurs associés à un guide
router.get('/:id/hunters', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);

    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID de guide invalide' });
    }

    // Récupérer les chasseurs associés avec leurs informations complètes
    const results = await db.select({
      associationId: guideHunterAssociations.id,
      guideId: guideHunterAssociations.guideId,
      hunterId: guideHunterAssociations.hunterId,
      associatedAt: guideHunterAssociations.associatedAt,
      hunterFirstName: hunters.firstName,
      hunterLastName: hunters.lastName,
      hunterPhone: hunters.phone,
      hunterIdNumber: hunters.idNumber,
      hunterNationality: hunters.nationality,
      hunterDepartement: hunters.departement,
      hunterCreatedAt: hunters.createdAt
    })
    .from(guideHunterAssociations)
    .innerJoin(hunters, eq(guideHunterAssociations.hunterId, hunters.id))
    .where(and(eq(guideHunterAssociations.guideId, guideId), eq(guideHunterAssociations.isActive, true)))
    .orderBy(hunters.lastName, hunters.firstName);

    // Transform to match frontend expected structure
    const associatedHunters = results.map(result => ({
      id: result.associationId,
      guideId: result.guideId,
      hunterId: result.hunterId,
      associatedAt: result.associatedAt,
      hunter: {
        id: result.hunterId,
        firstName: result.hunterFirstName,
        lastName: result.hunterLastName,
        phone: result.hunterPhone,
        idNumber: result.hunterIdNumber,
        nationality: result.hunterNationality, // Remplacer region par nationality
        zone: result.hunterDepartement, // Compatibility with frontend (legacy)
        departement: result.hunterDepartement, // New canonical key for UI wording
        createdAt: result.hunterCreatedAt
      }
    }));

    res.json(associatedHunters);
  } catch (error) {
    console.error('Erreur lors de la récupération des chasseurs associés:', error);
    res.status(500).json({ message: 'Échec de la récupération des chasseurs associés' });
  }
});

// Dissocier un chasseur d'un guide
router.delete('/:id/hunters/:hunterId', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const hunterId = req.params.hunterId;

    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID de guide invalide' });
    }

    // Marquer l'association comme inactive au lieu de la supprimer
    const [updatedAssociation] = await db.update(guideHunterAssociations)
      .set({ 
        isActive: false,
        dissociatedAt: new Date()
      })
      .where(and(eq(guideHunterAssociations.guideId, guideId), eq(guideHunterAssociations.hunterId, Number(hunterId))))
      .returning();

    if (!updatedAssociation) {
      return res.status(404).json({ message: 'Association non trouvée' });
    }

    res.json({ message: 'Chasseur dissocié avec succès' });
  } catch (error) {
    console.error('Erreur lors de la dissociation du chasseur:', error);
    res.status(500).json({ message: 'Échec de la dissociation du chasseur' });
  }
});

export default router;
