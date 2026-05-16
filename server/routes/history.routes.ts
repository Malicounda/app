// @ts-nocheck
import { Router } from 'express';
import { pg } from '../db.js';
import { isAdmin } from '../src/middleware/roles.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// Récupérer l'historique régional (pour les agents régionaux)
router.get('/regional', isAuthenticated, async (req, res) => {
  try {
    const { region } = req.query;
    const currentUser = req.user;

    // Vérifier que l'utilisateur est un agent régional et que la région correspond
    if (currentUser?.role !== 'agent') {
      return res.status(403).json({ message: "Accès refusé. Réservé aux agents régionaux." });
    }

    const userRegion = region || currentUser?.region;
    if (!userRegion) {
      return res.status(400).json({ message: "Région non spécifiée" });
    }

    // Récupérer tous les utilisateurs de la région (agents secteur et l'agent régional lui-même)
    // SQL brut via pg pour éviter tout conflit de types
    const regionalUsersRes = await pg.query(
      'SELECT id FROM users WHERE LOWER(region) = LOWER($1) AND role IN ($2, $3)',
      [String(userRegion), 'sub-agent', 'agent']
    );
    const userIds = regionalUsersRes.rows.map((u: any) => u.id as number);

    // Si aucun utilisateur trouvé, retourner un tableau vide
    if (userIds.length === 0) {
      return res.json([]);
    }

    // Récupérer l'historique avec sous-requêtes pour les informations utilisateur (SQL brut)
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const params: any[] = [...userIds, `%${userRegion}%`];
    const whereClause = `h.user_id IN (${placeholders}) OR (h.user_id IS NULL AND h.details ILIKE $${userIds.length + 1})`;

    const { rows } = await pg.query(
      `SELECT
         h.id AS "id",
         h.operation AS "operation",
         h.entity_type AS "entityType",
         h.entity_id AS "entityId",
         h.details AS "details",
         h.user_id AS "userId",
         h.created_at AS "createdAt",
         (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM users u WHERE u.id = h.user_id) AS "userName",
         (SELECT u.region FROM users u WHERE u.id = h.user_id) AS "userRegion",
         (SELECT u.departement FROM users u WHERE u.id = h.user_id) AS "userDepartement"
       FROM history h
       WHERE ${whereClause}
       ORDER BY h.created_at DESC
       LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique régional:", error);
    res.status(500).json({ message: "Échec de la récupération de l'historique régional" });
  }
});

// Récupérer l'historique (admin uniquement)
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { entityType, entityId, userId, operation, startDate, endDate, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Construire le WHERE et les paramètres (SQL brut)
    const clauses: string[] = [];
    const params: any[] = [];
    let p = 1;

    if (entityType) { clauses.push(`h.entity_type = $${p++}`); params.push(String(entityType)); }
    if (entityId)   { clauses.push(`h.entity_id = $${p++}`);   params.push(Number(entityId)); }
    if (userId)     { clauses.push(`h.user_id = $${p++}`);     params.push(Number(userId)); }
    if (operation)  { clauses.push(`h.operation = $${p++}`);   params.push(String(operation)); }

    if (startDate)  { clauses.push(`h.created_at >= $${p++}`); params.push(new Date(String(startDate))); }
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      clauses.push(`h.created_at <= $${p++}`);
      params.push(end);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // Compte total
    const countQuery = `SELECT COUNT(*)::int AS count FROM history h ${whereSql}`;
    const countRes = await pg.query(countQuery, params);
    const total: number = countRes.rows[0]?.count ?? 0;

    // Données paginées
    const dataQuery = `
      SELECT
        h.id AS "id",
        h.operation AS "operation",
        h.entity_type AS "entityType",
        h.entity_id AS "entityId",
        h.details AS "details",
        h.user_id AS "userId",
        h.created_at AS "createdAt"
      FROM history h
      ${whereSql}
      ORDER BY h.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `;
    const dataParams = [...params, Number(limit), offset];
    const dataRes = await pg.query(dataQuery, dataParams);

    res.json({
      data: dataRes.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de l'historique:", error);
    res.status(500).json({ message: "Échec de la récupération de l'historique" });
  }
});

// Récupérer l'historique d'une entité spécifique
router.get('/:entityType/:entityId', isAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { operation, limit = 20 } = req.query;

    const clauses = [ 'h.entity_type = $1', 'h.entity_id = $2' ];
    const params: any[] = [ entityType, Number(entityId) ];
    let p = 3;
    if (operation) { clauses.push(`h.operation = $${p++}`); params.push(String(operation)); }

    const { rows } = await pg.query(
      `SELECT
         h.id AS "id",
         h.operation AS "operation",
         h.entity_type AS "entityType",
         h.entity_id AS "entityId",
         h.details AS "details",
         h.user_id AS "userId",
         h.created_at AS "createdAt"
       FROM history h
       WHERE ${clauses.join(' AND ')}
       ORDER BY h.created_at DESC
       LIMIT $${p++}`,
      [...params, Number(limit)]
    );

    res.json(rows);
  } catch (error) {
    console.error(`Erreur lors de la récupération de l'historique pour ${req.params.entityType}/${req.params.entityId}:`, error);
    res.status(500).json({ message: "Échec de la récupération de l'historique" });
  }
});

// Récupérer l'historique d'un utilisateur spécifique (admin uniquement)
router.get('/user/:userId', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { entityType, operation, limit = 50 } = req.query;

    const clauses = [ 'h.user_id = $1' ];
    const params: any[] = [ Number(userId) ];
    let p = 2;
    if (entityType) { clauses.push(`h.entity_type = $${p++}`); params.push(String(entityType)); }
    if (operation)  { clauses.push(`h.operation = $${p++}`);   params.push(String(operation)); }

    const { rows } = await pg.query(
      `SELECT
         h.id AS "id",
         h.operation AS "operation",
         h.entity_type AS "entityType",
         h.entity_id AS "entityId",
         h.details AS "details",
         h.user_id AS "userId",
         h.created_at AS "createdAt"
       FROM history h
       WHERE ${clauses.join(' AND ')}
       ORDER BY h.created_at DESC
       LIMIT $${p++}`,
      [...params, Number(limit)]
    );

    res.json(rows);
  } catch (error) {
    console.error(`Erreur lors de la récupération de l'historique de l'utilisateur ${req.params.userId}:`, error);
    res.status(500).json({ message: "Échec de la récupération de l'historique utilisateur" });
  }
});

export default router;

// Supprimer une entrée d'historique par id (admin uniquement)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pg.query('DELETE FROM history WHERE id = $1', [Number(id)]);
    return res.status(204).send();
  } catch (error) {
    console.error(`Erreur lors de la suppression de l'historique ${req.params.id}:`, error);
    return res.status(500).json({ message: 'Échec de la suppression de l\'historique' });
  }
});
