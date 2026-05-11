import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { history, users } from '../../shared/dist/schema.js';
import { db } from '../db.js';
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
    const regionalUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          sql`LOWER(${users.region}) = LOWER(${userRegion})`,
          or(
            eq(users.role, 'sub-agent'),
            eq(users.role, 'agent')
          )
        )
      );

    const userIds = regionalUsers.map(u => u.id);

    // Si aucun utilisateur trouvé, retourner un tableau vide
    if (userIds.length === 0) {
      return res.json([]);
    }

    // Récupérer l'historique avec jointure pour obtenir les informations utilisateur
    const historyEntries = await db
      .select({
        id: history.id,
        operation: history.operation,
        entityType: history.entityType,
        entityId: history.entityId,
        details: history.details,
        userId: history.userId,
        createdAt: history.createdAt,
        userName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        userRegion: users.region,
        userDepartement: users.departement,
      })
      .from(history)
      .leftJoin(users, eq(history.userId, users.id))
      .where(
        or(
          inArray(history.userId, userIds),
          // Inclure aussi les événements système (userId null) liés à la région
          and(
            sql`${history.userId} IS NULL`,
            sql`${history.details} ILIKE ${`%${userRegion}%`}`
          )
        )
      )
      .orderBy(desc(history.createdAt))
      .limit(500);

    res.json(historyEntries);
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

    // Construire la requête avec les filtres
    let query = db.select()
      .from(history)
      .$dynamic();

    // Appliquer les filtres
    const conditions = [];

    if (entityType) {
      conditions.push(eq(history.entityType, String(entityType)));
    }

    if (entityId) {
      conditions.push(eq(history.entityId, Number(entityId)));
    }

    if (userId) {
      conditions.push(eq(history.userId, Number(userId)));
    }

    if (operation) {
      conditions.push(eq(history.operation, String(operation)));
    }

    if (startDate) {
      conditions.push(sql`${history.createdAt} >= ${new Date(String(startDate))}`);
    }

    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999); // Fin de la journée
      conditions.push(sql`${history.createdAt} <= ${end}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Compter le nombre total d'entrées pour la pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(history)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    // Récupérer les entrées avec pagination
    const historyEntries = await query
      .orderBy(desc(history.createdAt))
      .limit(Number(limit))
      .offset(offset);

    res.json({
      data: historyEntries,
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

    let query = db.select()
      .from(history)
      .where(
        and(
          eq(history.entityType, entityType),
          eq(history.entityId, Number(entityId))
        )
      )
      .$dynamic();

    if (operation) {
      query = query.where(eq(history.operation, String(operation)));
    }

    const historyEntries = await query
      .orderBy(desc(history.createdAt))
      .limit(Number(limit));

    res.json(historyEntries);
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

    let query = db.select()
      .from(history)
      .where(eq(history.userId, Number(userId)))
      .$dynamic();

    if (entityType) {
      query = query.where(eq(history.entityType, String(entityType)));
    }

    if (operation) {
      query = query.where(eq(history.operation, String(operation)));
    }

    const userHistory = await query
      .orderBy(desc(history.createdAt))
      .limit(Number(limit));

    res.json(userHistory);
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
    const deleted = await db.delete(history).where(eq(history.id, Number(id)));

    // deleted row count may vary depending on driver; return 204 if succeed
    return res.status(204).send();
  } catch (error) {
    console.error(`Erreur lors de la suppression de l'historique ${req.params.id}:`, error);
    return res.status(500).json({ message: 'Échec de la suppression de l\'historique' });
  }
});
