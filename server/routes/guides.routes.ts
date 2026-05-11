// @ts-nocheck
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

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
        const u: any[] = await db.execute(sql`select departement from users where id = ${requester.id} limit 1` as any);
        sectorDepartement = (u[0]?.departement || sectorDepartement) as string | undefined;
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

    // Utiliser SQL brut pour éviter les conflits de types Drizzle
    let rows: any[] = [];
    if (isRegionalAgent) {
      rows = await db.execute(sql`
        SELECT
          hg.id,
          hg.first_name AS "firstName",
          hg.last_name AS "lastName",
          hg.phone,
          hg.departement AS "zone",
          hg.region,
          hg.id_number AS "idNumber",
          hg.photo,
          hg.is_active AS "isActive",
          hg.created_at AS "createdAt",
          hg.user_id AS "userId",
          hg.zone_id AS "zoneId",
          u.username AS "username"
        FROM hunting_guides hg
        LEFT JOIN users u ON hg.user_id = u.id
        WHERE hg.region = ${requester.region}
        ORDER BY hg.last_name, hg.first_name
      ` as any) as any[];
    } else if (isSectorAgent && sectorDepartement) {
      rows = await db.execute(sql`
        SELECT
          hg.id,
          hg.first_name AS "firstName",
          hg.last_name AS "lastName",
          hg.phone,
          hg.departement AS "zone",
          hg.region,
          hg.id_number AS "idNumber",
          hg.photo,
          hg.is_active AS "isActive",
          hg.created_at AS "createdAt",
          hg.user_id AS "userId",
          hg.zone_id AS "zoneId",
          u.username AS "username"
        FROM hunting_guides hg
        LEFT JOIN users u ON hg.user_id = u.id
        WHERE LOWER(hg.departement) = LOWER(${sectorDepartement})
           OR LOWER(hg.departement) = LOWER(${"Secteur " + sectorDepartement})
        ORDER BY hg.last_name, hg.first_name
      ` as any) as any[];
    } else {
      rows = await db.execute(sql`
        SELECT
          hg.id,
          hg.first_name AS "firstName",
          hg.last_name AS "lastName",
          hg.phone,
          hg.departement AS "zone",
          hg.region,
          hg.id_number AS "idNumber",
          hg.photo,
          hg.is_active AS "isActive",
          hg.created_at AS "createdAt",
          hg.user_id AS "userId",
          hg.zone_id AS "zoneId",
          u.username AS "username"
        FROM hunting_guides hg
        LEFT JOIN users u ON hg.user_id = u.id
        ORDER BY hg.last_name, hg.first_name
      ` as any) as any[];
    }

    res.json(rows);
  } catch (error) {
    console.error("Erreur lors de la récupération des guides:", error);
    res.status(500).json({ message: "Échec de la récupération des guides" });
  }
});

// Récupérer un guide spécifique par son ID (guide_id ou user_id)
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Chercher d'abord par guide_id, puis par user_id
    const rows: any[] = await db.execute(sql`
      SELECT
        hg.id,
        hg.first_name AS "firstName",
        hg.last_name AS "lastName",
        hg.phone,
        hg.departement AS "zone",
        hg.region,
        hg.id_number AS "idNumber",
        hg.photo,
        hg.is_active AS "isActive",
        hg.created_at AS "createdAt",
        hg.user_id AS "userId",
        hg.zone_id AS "zoneId",
        u.username AS "username"
      FROM hunting_guides hg
      LEFT JOIN users u ON hg.user_id = u.id
      WHERE hg.id = ${id} OR hg.user_id = ${id}
      LIMIT 1
    ` as any) as any[];

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération du guide:', error);
    res.status(500).json({ message: 'Échec de la récupération du guide' });
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

    const rows: any[] = await db.execute(sql`
      SELECT
        hg.id,
        hg.first_name AS "firstName",
        hg.last_name AS "lastName",
        hg.phone,
        hg.departement AS "zone",
        hg.region,
        hg.id_number AS "idNumber",
        hg.photo,
        hg.is_active AS "isActive",
        hg.created_at AS "createdAt",
        hg.user_id AS "userId",
        hg.zone_id AS "zoneId",
        u.username AS "username"
      FROM hunting_guides hg
      LEFT JOIN users u ON hg.user_id = u.id
      WHERE LOWER(hg.departement) = LOWER(${departement})
         OR LOWER(hg.departement) = LOWER(${"Secteur " + departement})
      ORDER BY hg.last_name, hg.first_name
    ` as any) as any[];

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
    const guide: any[] = await db.execute(sql`
      SELECT id, user_id FROM hunting_guides WHERE id = ${guideId} LIMIT 1
    ` as any) as any[];
    if (guide.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    // Supprimer le guide
    await db.execute(sql`DELETE FROM hunting_guides WHERE id = ${guideId}` as any);

    // Optionnel: désactiver l'utilisateur lié (au lieu de supprimer définitivement)
    if ((guide[0] as any).user_id) {
      await db.execute(sql`UPDATE users SET is_active = FALSE WHERE id = ${guide[0].user_id}` as any);
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
    const { firstName, lastName, phone, zone, region, idNumber, photo, username, password, zoneId } = req.body;
    const departement = (req.body.departement ?? zone) as string | undefined;
    const _zoneId = zoneId != null ? Number(zoneId) : null;

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
    const newUsers: any[] = await db.execute(sql`
      INSERT INTO users (username, password, email, first_name, last_name, phone, region, departement, role, is_active)
      VALUES (${_username}, ${_password}, ${_username + '@guide.scodippc.com'}, ${_firstName}, ${_lastName}, ${_phone}, ${_region}, ${_departement}, 'hunting-guide', TRUE)
      RETURNING id, username
    ` as any) as any[];
    const newUser = newUsers[0];

    // 2. Ensuite, créer le guide et lier l'utilisateur
    const newGuides: any[] = await db.execute(sql`
      INSERT INTO hunting_guides (first_name, last_name, phone, departement, region, id_number, photo, user_id, is_active, created_at, zone_id)
      VALUES (${_firstName}, ${_lastName}, ${_phone}, ${_departement}, ${_region}, ${_idNumber}, ${photo}, ${newUser.id}, TRUE, NOW(), ${_zoneId})
      RETURNING id, first_name AS "firstName", last_name AS "lastName", phone, departement AS "zone", region, id_number AS "idNumber", photo, user_id AS "userId", is_active AS "isActive", created_at AS "createdAt", zone_id AS "zoneId"
    ` as any) as any[];
    const newGuide = newGuides[0];

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
    const { firstName, lastName, phone, zone, region, idNumber, photo, isActive, username, password, zoneId } = req.body;
    const departement = req.body.departement ?? zone;
    const _zoneId = zoneId != null ? Number(zoneId) : null;
    const requester: any = (req as any).user || (req as any).session?.user;
    const isRegionalAgent = requester?.role === 'agent' && requester?.region;
    const forcedRegion = isRegionalAgent ? String(requester.region) : undefined;

    // Si agent régional: vérifier que le guide appartient à sa région
    if (isRegionalAgent) {
      const existing: any[] = await db.execute(sql`SELECT region FROM hunting_guides WHERE id = ${guideId} LIMIT 1` as any) as any[];
      const currentRegion = existing[0]?.region;
      if (currentRegion && currentRegion !== forcedRegion) {
        return res.status(403).json({ message: "Interdit: vous ne pouvez modifier que les guides de votre région." });
      }
    }

    // 1. D'abord, mettre à jour les informations du guide
    const updatedRows: any[] = await db.execute(sql`
      UPDATE hunting_guides SET
        first_name = COALESCE(${firstName}, first_name),
        last_name = COALESCE(${lastName}, last_name),
        phone = COALESCE(${phone}, phone),
        departement = COALESCE(${departement}, departement),
        region = COALESCE(${forcedRegion ?? null}::text, COALESCE(${region}, region)),
        id_number = COALESCE(${idNumber}, id_number),
        photo = COALESCE(${photo}::bytea, photo),
        is_active = COALESCE(${typeof isActive !== 'undefined' ? isActive : null}::boolean, is_active),
        zone_id = ${_zoneId}
      WHERE id = ${guideId}
      RETURNING id, first_name AS "firstName", last_name AS "lastName", phone, departement AS "zone", region, id_number AS "idNumber", photo, user_id AS "userId", is_active AS "isActive", created_at AS "createdAt", zone_id AS "zoneId"
    ` as any) as any[];
    const updatedGuide = updatedRows[0];

    if (!updatedGuide) {
      return res.status(404).json({ message: "Guide non trouvé" });
    }

    // 2. Si le guide a un userId, mettre à jour les informations de l'utilisateur correspondant
    if (updatedGuide.userId) {
      await db.execute(sql`
        UPDATE users SET
          first_name = COALESCE(${firstName}, first_name),
          last_name = COALESCE(${lastName}, last_name),
          phone = COALESCE(${phone}, phone),
          region = COALESCE(${region}, region),
          username = COALESCE(${username}, username),
          password = COALESCE(${password}, password)
        WHERE id = ${updatedGuide.userId}
      ` as any);
    }

    // 3. Récupérer les informations à jour avec le username (sélection explicite des colonnes)
    const result = await db.execute(sql`
      SELECT
        hg.id,
        hg.first_name AS "firstName",
        hg.last_name AS "lastName",
        hg.phone,
        hg.departement AS "zone",
        hg.region,
        hg.id_number AS "idNumber",
        hg.photo,
        hg.is_active AS "isActive",
        hg.created_at AS "createdAt",
        hg.user_id AS "userId",
        hg.zone_id AS "zoneId",
        u.username AS "username"
      FROM hunting_guides hg
      LEFT JOIN users u ON hg.user_id = u.id
      WHERE hg.id = ${guideId}
    ` as any) as any[];

    res.json(result[0] || updatedGuide);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du guide:", error);
    res.status(500).json({ message: "Échec de la mise à jour du guide" });
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
    const guide = await db.execute(sql`SELECT 1 FROM hunting_guides WHERE id = ${guideId} LIMIT 1` as any) as any[];
    if (guide.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    // Vérifier que le chasseur existe
    const hunter = await db.execute(sql`SELECT 1 FROM hunters WHERE id = ${hunterId} LIMIT 1` as any) as any[];
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
    const anyActiveAssociation = await db.execute(sql`
      SELECT
        gha.guide_id AS guide_id,
        hg.first_name AS first_name,
        hg.last_name AS last_name
      FROM guide_hunter_associations gha
      INNER JOIN hunting_guides hg ON gha.guide_id = hg.id
      WHERE gha.hunter_id = ${hunterId} AND gha.is_active = TRUE
      LIMIT 1
    ` as any) as any[];

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
    const existingAssociation = await db.execute(sql`
      SELECT * FROM guide_hunter_associations WHERE guide_id = ${guideId} AND hunter_id = ${hunterId} LIMIT 1
    ` as any) as any[];

    if (existingAssociation.length > 0 && !existingAssociation[0].isActive) {
      // Réactiver l'association
      const reactivated = await db.execute(sql`
        UPDATE guide_hunter_associations
        SET is_active = TRUE, associated_at = NOW(), dissociated_at = NULL
        WHERE guide_id = ${guideId} AND hunter_id = ${hunterId}
        RETURNING *
      ` as any) as any[];

      return res.status(200).json({
        message: 'Chasseur réassocié avec succès',
        association: reactivated
      });
    }

    // Créer l'association
    const inserted = await db.execute(sql`
      INSERT INTO guide_hunter_associations (guide_id, hunter_id, associated_at, is_active)
      VALUES (${guideId}, ${hunterId}, NOW(), TRUE)
      RETURNING *
    ` as any) as any[];

    res.status(201).json({
      message: 'Chasseur associé avec succès',
      association: inserted
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

    // Récupérer les associations actives avec les informations des chasseurs
    const rows: any[] = await db.execute(sql`
      SELECT
        gha.id,
        gha.guide_id AS "guideId",
        gha.hunter_id AS "hunterId",
        gha.associated_at AS "associatedAt",
        gha.is_active AS "isActive",
        h.first_name AS "hunter.firstName",
        h.last_name AS "hunter.lastName",
        h.phone AS "hunter.phone",
        h.id_number AS "hunter.idNumber"
      FROM guide_hunter_associations gha
      INNER JOIN hunters h ON gha.hunter_id = h.id
      WHERE gha.guide_id = ${guideId} AND gha.is_active = TRUE
      ORDER BY gha.associated_at DESC
    ` as any) as any[];

    // Restructurer les données pour avoir un objet hunter imbriqué
    const associations = rows.map((row: any) => ({
      id: row.id,
      guideId: row.guideId,
      hunterId: row.hunterId,
      associatedAt: row.associatedAt,
      isActive: row.isActive,
      hunter: {
        firstName: row['hunter.firstName'],
        lastName: row['hunter.lastName'],
        phone: row['hunter.phone'],
        idNumber: row['hunter.idNumber']
      }
    }));

    res.json(associations);
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
    const updated = await db.execute(sql`
      UPDATE guide_hunter_associations
      SET is_active = FALSE, dissociated_at = NOW()
      WHERE guide_id = ${guideId} AND hunter_id = ${Number(hunterId)}
      RETURNING *
    ` as any) as any[];

    if (!updated || updated.length === 0) {
      return res.status(404).json({ message: 'Association non trouvée' });
    }

    res.json({ message: 'Chasseur dissocié avec succès' });
  } catch (error) {
    console.error('Erreur lors de la dissociation du chasseur:', error);
    res.status(500).json({ message: 'Échec de la dissociation du chasseur' });
  }
});

// Mettre à jour le statut actif/inactif d'un guide
router.patch('/:id/status', isAuthenticated, async (req, res) => {
  try {
    const guideId = Number(req.params.id);
    const { isActive } = req.body as { isActive?: boolean };

    if (Number.isNaN(guideId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'Le champ isActive (boolean) est requis.' });
    }

    // Mettre à jour le guide et récupérer user_id
    const updated: any[] = await db.execute(sql`
      UPDATE hunting_guides
      SET is_active = ${isActive}
      WHERE id = ${guideId}
      RETURNING id, user_id
    ` as any) as any[];

    if (!updated || updated.length === 0) {
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    const userId = updated[0]?.user_id as number | null;
    if (userId) {
      await db.execute(sql`UPDATE users SET is_active = ${isActive} WHERE id = ${userId}` as any);
    }

    // Retourner l’objet guide complet mis à jour avec username
    const result: any[] = await db.execute(sql`
      SELECT
        hg.id,
        hg.first_name AS "firstName",
        hg.last_name AS "lastName",
        hg.phone,
        hg.departement AS "zone",
        hg.region,
        hg.id_number AS "idNumber",
        hg.photo,
        hg.is_active AS "isActive",
        hg.created_at AS "createdAt",
        hg.user_id AS "userId",
        hg.zone_id AS "zoneId",
        u.username AS "username"
      FROM hunting_guides hg
      LEFT JOIN users u ON hg.user_id = u.id
      WHERE hg.id = ${guideId}
    ` as any) as any[];

    res.json(result[0] ?? { id: guideId, isActive });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut du guide:', error);
    res.status(500).json({ message: "Échec de la mise à jour du statut du guide" });
  }
});

// Uploader une photo pour un guide (stockage direct en BYTEA)
router.post('/:id/photo', isAuthenticated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const { photoData } = req.body;
    if (!photoData || !photoData.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Données de photo invalides' });
    }

    // Extraire le type MIME et les données base64
    const matches = photoData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ message: 'Format de données invalide' });
    }

    const base64Data = matches[2];

    // Convertir base64 en buffer pour stockage en BYTEA
    const photoBuffer = Buffer.from(base64Data, 'base64');

    // Mettre à jour la colonne BYTEA dans la base de données
    await db.execute(sql`
      UPDATE hunting_guides SET photo = ${photoBuffer} WHERE id = ${id}
    ` as any);

    res.json({ message: 'Photo mise à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors de l\'upload de la photo du guide:', error);
    res.status(500).json({ message: 'Échec de l\'upload de la photo' });
  }
});

// Route de secours pour l'ancien format (au cas où)
router.get('/photo/:id', isAuthenticated, async (req, res) => {
  console.log(`🔄 [GUIDES PHOTO LEGACY] Requête legacy reçue pour guide ID: ${req.params.id}`);
  // Rediriger vers la nouvelle route
  return res.redirect(`/api/guides/${req.params.id}/photo`);
});

// Servir la photo d'un guide spécifique (données BYTEA depuis la DB)
router.get('/:id/photo', isAuthenticated, async (req, res) => {
  console.log(`🔍 [GUIDES PHOTO] Requête reçue pour guide ID: ${req.params.id}`);
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      console.log(`❌ [GUIDES PHOTO] ID invalide: ${req.params.id}`);
      return res.status(400).json({ message: 'ID invalide' });
    }

    console.log(`📡 [GUIDES PHOTO] Récupération photo pour guide ${id}`);

    // Récupérer les données binaires de la photo depuis la base de données
    const rows: any[] = await db.execute(sql`
      SELECT photo FROM hunting_guides WHERE id = ${id} LIMIT 1
    ` as any) as any[];

    console.log(`📊 [GUIDES PHOTO] Résultat DB: ${rows.length} lignes trouvées`);

    if (rows.length === 0) {
      console.log(`❌ [GUIDES PHOTO] Guide ${id} non trouvé`);
      return res.status(404).json({ message: 'Guide non trouvé' });
    }

    if (!rows[0].photo) {
      console.log(`⚠️ [GUIDES PHOTO] Guide ${id} n'a pas de photo`);
      return res.status(404).json({ message: 'Photo non trouvée' });
    }

    console.log(`✅ [GUIDES PHOTO] Photo trouvée pour guide ${id}, taille: ${rows[0].photo.length} bytes`);

    // Les données sont déjà en Buffer depuis Drizzle
    const photoBuffer = rows[0].photo;
    console.log(`🔍 [GUIDES PHOTO] Premiers bytes: ${photoBuffer.slice(0, 10).toString('hex')}`);

    // Détecter le type MIME basé sur les premiers bytes
    const detectMimeType = (buffer: Buffer): string => {
      if (buffer.length < 4) return 'application/octet-stream';

      // JPEG (FF D8)
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        console.log(`📷 [GUIDES PHOTO] JPEG détecté`);
        return 'image/jpeg';
      }
      // PNG (89 50 4E 47)
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        console.log(`📷 [GUIDES PHOTO] PNG détecté`);
        return 'image/png';
      }
      // GIF (47 49 46)
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        console.log(`📷 [GUIDES PHOTO] GIF détecté`);
        return 'image/gif';
      }
      // WebP (52 49 46 46)
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        console.log(`📷 [GUIDES PHOTO] WebP détecté`);
        return 'image/webp';
      }
      // BMP (42 4D)
      if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        console.log(`📷 [GUIDES PHOTO] BMP détecté`);
        return 'image/bmp';
      }

      console.log(`⚠️ [GUIDES PHOTO] Type non reconnu, premiers bytes: ${buffer.slice(0, 4).toString('hex')}`);
      return 'application/octet-stream';
    };

    const mimeType = detectMimeType(Buffer.from(photoBuffer));
    console.log(`📷 [GUIDES PHOTO] Type MIME détecté: ${mimeType}`);

    // Si le type n'est pas reconnu, essayer de servir quand même comme JPEG (cas fréquent)
    if (mimeType === 'application/octet-stream') {
      console.log(`🔄 [GUIDES PHOTO] Type inconnu, tentative avec image/jpeg`);
      res.set('Content-Type', 'image/jpeg');
    } else {
      res.set('Content-Type', mimeType);
    }

    res.set('Cache-Control', 'public, max-age=3600'); // Cache 1 heure
    res.send(Buffer.from(photoBuffer));
    console.log(`🚀 [GUIDES PHOTO] Photo envoyée avec succès`);
  } catch (error) {
    console.error('❌ [GUIDES PHOTO] Erreur lors de la récupération de la photo du guide:', error);
    res.status(500).json({ message: 'Échec de la récupération de la photo' });
  }
});

export default router;
