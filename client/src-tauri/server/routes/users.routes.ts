import bcrypt from 'bcryptjs';
import { and, count, asc as dslAsc, desc as dslDesc, eq, ilike, isNotNull, or, SQL } from 'drizzle-orm';
import { sql as sqlRaw } from 'drizzle-orm/sql';
import express, { Request, Router } from 'express';
import { z } from 'zod';
import { insertUserSchema as baseInsertUserSchema, userRoleEnum, users as usersTableSchema } from '../../shared/schema.js';
import { db } from '../db.js';
import { getDepartementCentroid, getRegionCentroid } from '../lib/geoAgentLookup.js';
import { isAdmin, isAdminAgentOrSubAgent } from '../src/middleware/roles.js';
import { DatabaseStorage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const storage = new DatabaseStorage();
const router: Router = express.Router();

// Define a type for User selection, useful for typing results
type User = typeof usersTableSchema.$inferSelect;

// Schéma Zod pour la création d'un agent
const createAgentSchema = baseInsertUserSchema.extend({
  username: z.string().min(3, "Le nom d'utilisateur de l'agent doit contenir au moins 3 caractères."),
  email: z.string().email("L'email de l'agent n'est pas valide."),
  password: z.string().min(6, "Le mot de passe de l'agent doit contenir au moins 6 caractères."),
  role: z.enum(userRoleEnum.enumValues).optional(),
  matricule: z.string().optional(),
  serviceLocation: z.string().optional(),
  region: z.string().optional(),
  departement: z.string().optional(),
  domain: z.string().optional(),
  confirmExisting: z.boolean().optional(),
}).omit({
  hunterId: true,
});

// Mettre à jour la géolocalisation d'un agent (admin/agent/sub-agent ou l'utilisateur lui-même)
const updateLocationSchema = z.object({
  lat: z.number().refine(v => isFinite(v), 'Latitude invalide'),
  lon: z.number().refine(v => isFinite(v), 'Longitude invalide'),
});

router.put('/:id/location', isAuthenticated, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }

    const { lat, lon } = updateLocationSchema.parse(req.body);

    const currentUser = req.user as any;
    const canManage = ['admin', 'agent', 'sub-agent'].includes(String(currentUser?.role));
    if (!canManage && currentUser?.id !== targetUserId) {
      return res.status(403).json({ message: "Non autorisé à modifier la localisation de cet utilisateur." });
    }

    const [updated] = await db.update(usersTableSchema)
      .set({ agentLat: lat as any, agentLon: lon as any })
      .where(eq(usersTableSchema.id, targetUserId))
      .returning({
        id: usersTableSchema.id,
        username: usersTableSchema.username,
        role: usersTableSchema.role,
        region: usersTableSchema.region,
        departement: usersTableSchema.departement,
        agentLat: usersTableSchema.agentLat,
        agentLon: usersTableSchema.agentLon,
      });

    if (!updated) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    await storage.createHistory({
      userId: currentUser!.id,
      operation: 'update',
      entityType: 'user',
      entityId: updated.id,
      details: `Mise à jour de la localisation (lat=${lat}, lon=${lon}) pour l'utilisateur ${updated.username} (ID: ${updated.id}).`
    });

    return res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Données de localisation invalides', errors: error.errors });
    }
    console.error('Erreur lors de la mise à jour de la localisation:', error);
    return res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
  }
});

// Interface for query parameters for listing users/agents
interface UserListQuery {
  page?: string;
  limit?: string;
  search?: string;
  role?: string;
  region?: string;
  zone?: string;
  sortBy?: keyof User;
  order?: 'asc' | 'desc';
}

// Utilisateurs éligibles pour créer un profil chasseur (pas encore associés à un hunter)
router.get('/eligible-for-hunter-profile', isAuthenticated, isAdminAgentOrSubAgent, async (req, res) => {
  try {
    const users = await db.query.users.findMany({
      where: and(
        // Le rôle 'user' n'existe pas dans l'enum. Les comptes éligibles sont des 'hunter' sans profil chasseur lié.
        eq(usersTableSchema.role, 'hunter' as any),
        eq(usersTableSchema.isActive, true as any),
        eq(usersTableSchema.hunterId, null as any)
      ),
      orderBy: [dslAsc(usersTableSchema.username)],
      columns: { password: false },
    });
    res.json(users);
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs éligibles:', error);
    res.status(500).json({ message: "Échec de la récupération des utilisateurs éligibles" });
  }
});

// Créer un nouvel agent (admin uniquement)
router.post('/create-agent', isAuthenticated, async (req, res) => {
  const currentUser = req.user as any;
  try {
    const rawDomainHeader = (req.headers as any)['x-domain'];
    let headerDomain = '';
    if (Array.isArray(rawDomainHeader)) headerDomain = String(rawDomainHeader[0] || '');
    else if (typeof rawDomainHeader === 'string') headerDomain = rawDomainHeader;

    const ensureDomainAssignment = async (userId: number, domainName: string, roleForDomain: string | null, niveauAcces?: string | null, zoneGeo?: string | null) => {
      const normalized = String(domainName || '').toUpperCase().trim();
      if (!normalized) return;

      const domaineRows = await db.execute(sqlRaw`
        SELECT id
        FROM domaines
        WHERE nom_domaine = ${normalized}
        LIMIT 1;
      `);
      const domaineId = Array.isArray(domaineRows) ? (domaineRows as any[])[0]?.id ?? null : null;

      const existingRows = await db.execute(sqlRaw`
        SELECT id, domaine_id, niveau_acces, zone_geographique, role
        FROM user_domains
        WHERE user_id = ${userId} AND domain = ${normalized}
        LIMIT 1;
      `);
      const existing = Array.isArray(existingRows) ? (existingRows as any[])[0] : undefined;
      if (existing?.id) {
        await db.execute(sqlRaw`
          UPDATE user_domains
          SET
            active = TRUE,
            role = COALESCE(${roleForDomain}, role),
            domaine_id = COALESCE(domaine_id, ${domaineId}),
            niveau_acces = COALESCE(niveau_acces, ${niveauAcces ?? null}),
            zone_geographique = COALESCE(zone_geographique, ${zoneGeo ?? null})
          WHERE id = ${existing.id};
        `);
        return;
      }

      await db.execute(sqlRaw`
        INSERT INTO user_domains (user_id, domain, domaine_id, niveau_acces, zone_geographique, role, active)
        VALUES (${userId}, ${normalized}, ${domaineId}, ${niveauAcces ?? null}, ${zoneGeo ?? null}, ${roleForDomain}, TRUE)
        ON CONFLICT (user_id, domain) DO UPDATE SET active = TRUE;
      `);
    };

    const ensureAgentRegistry = async (userRow: any, matriculeSol: string | null | undefined) => {
      const hasAgentRows = await db.execute(sqlRaw`
        SELECT id_agent
        FROM agents
        WHERE user_id = ${userRow.id}
        LIMIT 1;
      `);
      const hasAgent = Array.isArray(hasAgentRows) ? (hasAgentRows as any[])[0] : undefined;
      if (hasAgent?.id_agent) return;
      const matriculeValue = String(matriculeSol || userRow.matricule || userRow.username || '').trim();
      if (!matriculeValue) return;
      await db.execute(sqlRaw`
        INSERT INTO agents (user_id, matricule_sol, nom, prenom, grade, contact)
        VALUES (
          ${userRow.id},
          ${matriculeValue},
          ${userRow.lastName ?? null},
          ${userRow.firstName ?? null},
          ${null},
          ${JSON.stringify({ telephone: userRow.phone ?? null, email: userRow.email ?? null })}::jsonb
        )
        ON CONFLICT (user_id) DO NOTHING;
      `);
    };

    // ADMIN: peut tout faire
    if (currentUser.role === 'admin') {
      // logique existante déplacée plus bas
    } else if (currentUser.role === 'agent') {
      // AGENT: peut créer uniquement des sub-agents pour sa région
      const validatedData = createAgentSchema.parse(req.body);

      const requestedDomain = String(validatedData.domain || headerDomain || 'CHASSE');

      if (validatedData.matricule) {
        const existingByMatricule = await storage.findUserByIdentifier(validatedData.matricule);
        if (existingByMatricule) {
          if (!validatedData.confirmExisting) {
            return res.status(409).json({
              message: "Un agent avec ce matricule existe déjà. Confirmez pour l'affecter à ce domaine.",
              code: 'AGENT_EXISTS',
              existingUser: { id: (existingByMatricule as any).id, username: (existingByMatricule as any).username },
            });
          }
          await ensureDomainAssignment(
            (existingByMatricule as any).id,
            requestedDomain,
            'sub-agent',
            'Secteur',
            validatedData.departement ?? null
          );
          await ensureAgentRegistry(existingByMatricule as any, validatedData.matricule);
          return res.status(200).json({
            message: "Affectation ajoutée.",
            user: { id: (existingByMatricule as any).id, username: (existingByMatricule as any).username },
          });
        }
      }

      if (validatedData.role !== 'sub-agent') {
        return res.status(403).json({ message: "Seuls les sous-comptes secteur peuvent être créés par un agent régional." });
      }
      // Empêcher la création dans une autre région
      if (validatedData.region && validatedData.region !== currentUser.region) {
        return res.status(403).json({ message: "Vous ne pouvez créer des agents que pour votre propre région." });
      }
      // Forcer la région à celle de l'agent connecté
      validatedData.region = currentUser.region;
      // Forcer le rôle
      validatedData.role = 'sub-agent';
      // Vérifier la présence de la zone
      if (!validatedData.departement) {
        return res.status(400).json({ message: "Le département (secteur) est requis pour un agent de secteur." });
      }
      // Vérifier unicité username/email/matricule
      const orConditions: SQL[] = [
        eq(usersTableSchema.username, validatedData.username),
        eq(usersTableSchema.email, validatedData.email),
      ];
      if (validatedData.matricule) {
        orConditions.push(eq(usersTableSchema.matricule, validatedData.matricule));
      }
      const existingUser = await db.query.users.findFirst({
        where: or(...orConditions),
      });
      if (existingUser) {
        let field = 'Nom d`utilisateur ou email';
        if (validatedData.matricule && existingUser.matricule === validatedData.matricule) {
          field = 'Matricule';
        }
        return res.status(400).json({ message: `${field} déjà utilisé.` });
      }
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      // Déterminer coordonnées par défaut à partir du département (centroïde)
      const deptCoords = getDepartementCentroid(validatedData.departement);

      const insertValues = {
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        phone: validatedData.phone,
        matricule: validatedData.matricule,
        // Lieu de service: automatiquement 'Secteur' pour un sous-agent
        serviceLocation: 'Secteur',
        region: currentUser.region,
        departement: validatedData.departement,
        role: 'sub-agent' as any,
        isActive: true,
        // N'écrase pas si le client a explicitement fourni (pas le cas actuellement)
        agentLat: (req.body?.agentLat ?? req.body?.agent_lat) ?? (deptCoords ? (deptCoords.lat as any) : undefined),
        agentLon: (req.body?.agentLon ?? req.body?.agent_lon) ?? (deptCoords ? (deptCoords.lon as any) : undefined),
      };
      const [createdSub] = await db.insert(usersTableSchema)
        .values(insertValues as any)
        .returning();
      const newUser = {
        id: createdSub.id,
        username: createdSub.username,
        email: createdSub.email,
        role: createdSub.role,
        matricule: createdSub.matricule,
        region: createdSub.region,
        departement: (createdSub as any).departement,
      } as any;
      await storage.createHistory({
        userId: currentUser.id,
        operation: 'create',
        entityType: 'user',
        entityId: newUser.id,
        details: `Création du sous-compte agent ${newUser.username} (ID: ${newUser.id}) pour la région ${currentUser.region}.`
      });
      await ensureDomainAssignment(newUser.id, requestedDomain, 'sub-agent', 'Secteur', validatedData.departement ?? null);
      await ensureAgentRegistry(createdSub as any, validatedData.matricule);
      return res.status(201).json(newUser);
    } else {
      return res.status(403).json({ message: "Accès refusé. Rôle administrateur ou agent requis." });
    }
    // ADMIN: logique existante

    // ADMIN: logique existante
    const validatedData = createAgentSchema.parse(req.body);
    const requestedDomain = String(validatedData.domain || headerDomain || 'CHASSE');

    if (validatedData.matricule) {
      const existingByMatricule = await storage.findUserByIdentifier(validatedData.matricule);
      if (existingByMatricule) {
        if (!validatedData.confirmExisting) {
          return res.status(409).json({
            message: "Un agent avec ce matricule existe déjà. Confirmez pour l'affecter à ce domaine.",
            code: 'AGENT_EXISTS',
            existingUser: { id: (existingByMatricule as any).id, username: (existingByMatricule as any).username },
          });
        }

        const roleForDomain = String((validatedData.role || (existingByMatricule as any).role || 'agent') as any);
        const niveau = roleForDomain === 'sub-agent' ? 'Secteur' : (roleForDomain === 'agent' ? 'Regional' : null);
        const zoneGeo = roleForDomain === 'sub-agent'
          ? (validatedData.departement ?? (existingByMatricule as any).departement ?? null)
          : (validatedData.region ?? (existingByMatricule as any).region ?? null);

        await ensureDomainAssignment((existingByMatricule as any).id, requestedDomain, roleForDomain, niveau, zoneGeo);
        await ensureAgentRegistry(existingByMatricule as any, validatedData.matricule);
        return res.status(200).json({
          message: "Affectation ajoutée.",
          user: { id: (existingByMatricule as any).id, username: (existingByMatricule as any).username },
        });
      }
    }
    const roleToAssign = (validatedData.role && ['agent', 'sub-agent'].includes(validatedData.role))
                          ? validatedData.role
                          : 'agent';

    if (roleToAssign === 'agent' && !validatedData.region) {
      return res.status(400).json({ message: "La région est requise pour un agent régional." });
    }
    if (roleToAssign === 'sub-agent') {
      if (!validatedData.departement) {
         return res.status(400).json({ message: "Le département (secteur) est requis pour un agent de secteur." });
      }
      if (!validatedData.region && !currentUser?.region) {
        return res.status(400).json({ message: "La région est requise pour un agent de secteur et n'a pu être déterminée." });
      }
    }

    const orConditions: SQL[] = [
      eq(usersTableSchema.username, validatedData.username),
      eq(usersTableSchema.email, validatedData.email),
    ];
    if (validatedData.matricule) {
      orConditions.push(eq(usersTableSchema.matricule, validatedData.matricule));
    }

    const existingUser = await db.query.users.findFirst({
      where: or(...orConditions),
    });

    if (existingUser) {
      let field = 'Nom d`utilisateur ou email';
      if (validatedData.matricule && existingUser.matricule === validatedData.matricule) {
        field = 'Matricule';
      }
      return res.status(400).json({ message: `${field} déjà utilisé.` });
    }

    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Ecarter explicitement tout champ inconnu (ex: 'zone') et ne garder que les colonnes de la table users
    // Déterminer coordonnées par défaut depuis région ou département selon le rôle
    let autoLat: number | undefined;
    let autoLon: number | undefined;
    if (roleToAssign === 'agent') {
      const rc = getRegionCentroid(validatedData.region || currentUser?.region);
      if (rc) { autoLat = rc.lat; autoLon = rc.lon; }
    } else if (roleToAssign === 'sub-agent') {
      const dc = getDepartementCentroid(validatedData.departement);
      if (dc) { autoLat = dc.lat; autoLon = dc.lon; }
    }

    const insertValues = {
      username: validatedData.username,
      email: validatedData.email,
      password: hashedPassword,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      phone: validatedData.phone,
      matricule: validatedData.matricule,
      // Lieu de service: 'IREF' pour agent régional, 'Secteur' pour agent de secteur
      serviceLocation: roleToAssign === 'agent' ? 'IREF' : (roleToAssign === 'sub-agent' ? 'Secteur' : validatedData.serviceLocation),
      region: validatedData.region || (roleToAssign === 'sub-agent' ? currentUser?.region : undefined),
      departement: validatedData.departement,
      role: roleToAssign as User['role'],
      isActive: true,
      agentLat: (req.body?.agentLat ?? req.body?.agent_lat) ?? (autoLat as any),
      agentLon: (req.body?.agentLon ?? req.body?.agent_lon) ?? (autoLon as any),
    };

    const [createdRow] = await db.insert(usersTableSchema)
      .values(insertValues as any)
      .returning();

    const newUser = {
      id: createdRow.id,
      username: createdRow.username,
      email: createdRow.email,
      role: createdRow.role,
      matricule: createdRow.matricule,
      region: createdRow.region,
      departement: (createdRow as any).departement,
    } as any;

    await storage.createHistory({
      userId: currentUser!.id,
      operation: 'create',
      entityType: 'user',
      entityId: newUser.id,
      details: `Création de l'agent ${newUser.username} (ID: ${newUser.id}) avec le rôle ${newUser.role}.`
    });

    const createdRole = String((createdRow as any).role || roleToAssign);
    const niveau = createdRole === 'sub-agent' ? 'Secteur' : (createdRole === 'agent' ? 'Regional' : null);
    const zoneGeo = createdRole === 'sub-agent'
      ? ((createdRow as any).departement ?? validatedData.departement ?? null)
      : ((createdRow as any).region ?? validatedData.region ?? null);
    await ensureDomainAssignment(newUser.id, requestedDomain, createdRole, niveau, zoneGeo);
    await ensureAgentRegistry(createdRow as any, validatedData.matricule);

    res.status(201).json(newUser);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Erreur de validation", errors: error.errors });
    }
    console.error("Erreur lors de la création de l'agent:", error);
    res.status(500).json({ message: error.message || "Erreur interne du serveur" });
  }
});

// Route pour récupérer les agents (régionaux et de secteur)
router.get('/agents', isAuthenticated, isAdmin, async (req: Request<{}, {}, {}, UserListQuery>, res) => {
  try {
    const {
      page = '1',
      limit = '10',
      search = '',
      role = '',
      region = '',
      zone = '',
      sortBy = 'username',
      order = 'asc'
    } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const offset = (pageNumber - 1) * limitNumber;

    const conditions: SQL[] = [];
    conditions.push(or(eq(usersTableSchema.role, 'agent'), eq(usersTableSchema.role, 'sub-agent'))!);

    if (search) {
      const searchLower = search.toLowerCase();
      conditions.push(
        or(
          ilike(usersTableSchema.username, `%${searchLower}%`),
          ilike(usersTableSchema.email, `%${searchLower}%`),
          ilike(usersTableSchema.firstName, `%${searchLower}%`),
          ilike(usersTableSchema.lastName, `%${searchLower}%`),
          ilike(usersTableSchema.matricule, `%${searchLower}%`)
        )!
      );
    }
    if (role) conditions.push(eq(usersTableSchema.role, role as User['role']));
    if (region) conditions.push(eq(usersTableSchema.region, region));
    if (zone) conditions.push(eq(usersTableSchema.departement, zone));

    const sortOrderFunction = order === 'desc' ? dslDesc : dslAsc;
    const orderByField = usersTableSchema[sortBy] || usersTableSchema.username;

    const agentUsers = await db.query.users.findMany({
      where: and(...conditions),
      orderBy: [sortOrderFunction(orderByField)],
      limit: limitNumber,
      offset: offset,
      columns: { password: false },
    });

    const totalAgents = await db.select({ count: count() }).from(usersTableSchema).where(and(...conditions));

    res.json({
      data: agentUsers,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: totalAgents[0]?.count || 0,
        totalPages: Math.ceil((totalAgents[0]?.count || 0) / limitNumber),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des agents:", error);
    res.status(500).json({ message: "Échec de la récupération des agents" });
  }
});

// Récupérer tous les utilisateurs (admin uniquement)
router.get('/', isAuthenticated, isAdmin, async (req: Request<{}, {}, {}, UserListQuery>, res) => {
  try {
    const {
      page = '1',
      limit = '10',
      search = '',
      role = '',
      sortBy = 'username',
      order = 'asc'
    } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const offset = (pageNumber - 1) * limitNumber;

    const conditions: SQL[] = [];
    if (search) {
      const searchLower = search.toLowerCase();
      conditions.push(
        or(
          ilike(usersTableSchema.username, `%${searchLower}%`),
          ilike(usersTableSchema.email, `%${searchLower}%`),
          ilike(usersTableSchema.firstName, `%${searchLower}%`),
          ilike(usersTableSchema.lastName, `%${searchLower}%`)
        )!
      );
    }
    if (role) conditions.push(eq(usersTableSchema.role, role as User['role']));

    const sortOrderFunction = order === 'desc' ? dslDesc : dslAsc;
    const orderByField = usersTableSchema[sortBy] || usersTableSchema.username;

    const allUsers = await db.query.users.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [sortOrderFunction(orderByField)],
      limit: limitNumber,
      offset: offset,
      columns: { password: false },
    });

    const totalUsers = await db.select({ count: count() }).from(usersTableSchema).where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      data: allUsers,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: totalUsers[0]?.count || 0,
        totalPages: Math.ceil((totalUsers[0]?.count || 0) / limitNumber),
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des utilisateurs:", error);
    res.status(500).json({ message: "Échec de la récupération des utilisateurs" });
  }
});

// Récupérer un utilisateur par ID (admin ou l'utilisateur lui-même)
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID utilisateur invalide." });
    }

    const currentUser = req.user as any;
    if (currentUser?.id !== userId && currentUser?.role !== 'admin') {
      return res.status(403).json({ message: "Accès non autorisé." });
    }

    const user = await db.query.users.findFirst({
      where: eq(usersTableSchema.id, userId),
      columns: { password: false },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    res.json(user);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    res.status(500).json({ message: "Échec de la récupération de l'utilisateur" });
  }
});

// Supprimer un utilisateur (admin uniquement)
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID utilisateur invalide." });
    }

    // Optionnel : vérifier si l'utilisateur existe
    const user = await db.query.users.findFirst({
      where: eq(usersTableSchema.id, userId),
    });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé." });
    }

    // Suppression réelle
    await db.delete(usersTableSchema).where(eq(usersTableSchema.id, userId));

    // Historique (optionnel)
    const currentUser = req.user as any;
    await storage.createHistory && storage.createHistory({
      userId: currentUser!.id,
      operation: 'delete',
      entityType: 'user',
      entityId: userId,
      details: `Suppression de l'utilisateur ID ${userId}`
    });

    res.status(204).send();
  } catch (error) {
    console.error("Erreur lors de la suppression de l'utilisateur:", error);
    res.status(500).json({ message: "Erreur lors de la suppression de l'utilisateur" });
  }
});

const loginSchema = z.object({
  email: z.string().email("L'email n'est pas valide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await db.query.users.findFirst({
      where: eq(usersTableSchema.email, email),
    });

    if (!user) {
      return res.status(400).json({ message: 'Email ou mot de passe incorrect.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Votre compte est inactif. Veuillez contacter un administrateur.' });
    }
    if (user.isSuspended) {
      return res.status(403).json({ message: 'Votre compte est suspendu. Veuillez contacter un administrateur.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Email ou mot de passe incorrect.' });
    }

    const updatedUserArray = await db.update(usersTableSchema)
      .set({})
      .where(eq(usersTableSchema.id, user.id))
      .returning({
        id: usersTableSchema.id,
        username: usersTableSchema.username,
        email: usersTableSchema.email,
        firstName: usersTableSchema.firstName,
        lastName: usersTableSchema.lastName,
        role: usersTableSchema.role,
        region: usersTableSchema.region,
        departement: usersTableSchema.departement,
      });

    if (!updatedUserArray || updatedUserArray.length === 0) {
      return res.status(500).json({ message: "Erreur lors de la mise à jour de la date de connexion." });
    }

    const updatedUser = updatedUserArray[0];

    await storage.createHistory({
      userId: user.id,
      operation: 'login',
      entityType: 'user',
      entityId: user.id,
      details: `Utilisateur ${user.username} connecté.`
    });

    const token = storage.generateAuthToken({
      id: updatedUser.id,
      role: updatedUser.role as string,
      region: updatedUser.region || undefined
    });
    res.json({ token, user: updatedUser });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Données de connexion invalides", errors: error.errors });
    }
    console.error("Erreur de connexion:", error);
    res.status(500).json({ message: error.message || 'Erreur interne du serveur' });
  }
});

// Schéma pour la mise à jour d'un utilisateur (plus flexible)
const updateUserSchema = baseInsertUserSchema.partial().extend({
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères.").optional(),
});

// Mettre à jour un utilisateur (admin uniquement ou l'utilisateur lui-même pour certains champs)
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const userIdToUpdate = parseInt(req.params.id, 10);
    if (isNaN(userIdToUpdate)) {
      return res.status(400).json({ message: "ID utilisateur invalide." });
    }

    const validatedData = updateUserSchema.parse(req.body);
    const currentUser = req.user as any;

    if (currentUser.id !== userIdToUpdate && currentUser.role !== 'admin') {
      return res.status(403).json({ message: "Non autorisé à mettre à jour cet utilisateur." });
    }

    if (currentUser.role !== 'admin') {
      const raw = req.body as any;
      if (validatedData.role !== undefined || raw.isActive !== undefined || raw.isSuspended !== undefined) {
        return res.status(403).json({ message: "Vous n'êtes pas autorisé à modifier le rôle ou le statut d'activité/suspension." });
      }
    }

    const updateValues: Partial<typeof usersTableSchema.$inferInsert> = {};

    Object.keys(validatedData).forEach(key => {
      const typedKey = key as keyof typeof validatedData;
      if (validatedData[typedKey] !== undefined && typedKey !== 'password') {
        // Map 'zone' -> 'departement' pour compatibilité API
        if (key === 'zone') {
          (updateValues as any)['departement'] = (validatedData as any)[key] || null;
          return;
        }
        (updateValues as any)[typedKey] = (validatedData as any)[typedKey] === '' && ['phone', 'matricule', 'serviceLocation', 'region', 'departement'].includes(key)
          ? null
          : (validatedData as any)[typedKey];
      }
    });

    if (validatedData.password) {
      updateValues.password = await bcrypt.hash(validatedData.password, 10);
    }

    if (Object.keys(updateValues).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour.' });
    }

    const [updatedDbUser] = await db.update(usersTableSchema)
      .set(updateValues)
      .where(eq(usersTableSchema.id, userIdToUpdate))
      .returning({
        id: usersTableSchema.id,
        username: usersTableSchema.username,
        email: usersTableSchema.email,
        firstName: usersTableSchema.firstName,
        lastName: usersTableSchema.lastName,
        phone: usersTableSchema.phone,
        matricule: usersTableSchema.matricule,
        serviceLocation: usersTableSchema.serviceLocation,
        region: usersTableSchema.region,
        departement: usersTableSchema.departement,
        role: usersTableSchema.role,
        isActive: usersTableSchema.isActive,
        isSuspended: usersTableSchema.isSuspended,
      });

    if (!updatedDbUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    await storage.createHistory({
      userId: currentUser.id,
      operation: 'update',
      entityType: 'user',
      entityId: updatedDbUser.id,
      details: `Mise à jour de l'utilisateur ${updatedDbUser.username} (ID: ${updatedDbUser.id}). Champs modifiés: ${Object.keys(updateValues).join(', ')}`
    });

    res.json(updatedDbUser);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Données de mise à jour invalides", errors: error.errors });
    }
    console.error("Erreur lors de la mise à jour de l'utilisateur:", error);
    res.status(500).json({ message: error.message || "Erreur interne du serveur lors de la mise à jour" });
  }
});

// Route pour obtenir les régions et les zones distinctes des agents
router.get('/regions-zones', isAuthenticated, async (req, res) => {
  try {
    const result = await db
      // Ne plus exposer la clé legacy "zone"; renvoyer "departement"
      .selectDistinct({ region: usersTableSchema.region, departement: usersTableSchema.departement })
      .from(usersTableSchema)
      .where(and(
        isNotNull(usersTableSchema.region)
      ))
      .orderBy(dslAsc(usersTableSchema.region), dslAsc(usersTableSchema.departement));

    const filteredResults = result.filter((item: {region: string | null, departement: string | null}) => item.region && item.region.trim() !== '');

    res.json(filteredResults);
  } catch (error) {
    console.error("Erreur lors de la récupération des régions/zones:", error);
    res.status(500).json({ message: "Échec de la récupération des régions/zones" });
  }
});

// Activer un profil utilisateur (admin)
router.put('/:id/activate', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'ID utilisateur invalide' });

    const [activatedUser] = await db.update(usersTableSchema)
      .set({ isActive: true, isSuspended: false })
      .where(eq(usersTableSchema.id, userId))
      .returning({ id: usersTableSchema.id, username: usersTableSchema.username, isActive: usersTableSchema.isActive });

    if (!activatedUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const currentUser = req.user as any;
    await storage.createHistory({
      userId: currentUser!.id,
      operation: 'activate',
      entityType: 'user',
      entityId: activatedUser.id,
      details: `Utilisateur ${activatedUser.username} (ID: ${activatedUser.id}) activé.`
    });
    res.json({ message: `Utilisateur ${activatedUser.username} activé.`, user: activatedUser });
  } catch (error: any) {
    console.error("Erreur activation utilisateur:", error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Suspendre un profil utilisateur (admin)
router.put('/:id/suspend', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'ID utilisateur invalide' });

    const [suspendedUser] = await db.update(usersTableSchema)
      .set({ isSuspended: true, isActive: false })
      .where(eq(usersTableSchema.id, userId))
      .returning({ id: usersTableSchema.id, username: usersTableSchema.username, isSuspended: usersTableSchema.isSuspended });

    if (!suspendedUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const currentUser = req.user as any;
    await storage.createHistory({
      userId: currentUser!.id,
      operation: 'suspend',
      entityType: 'user',
      entityId: suspendedUser.id,
      details: `Utilisateur ${suspendedUser.username} (ID: ${suspendedUser.id}) suspendu.`
    });
    res.json({ message: `Utilisateur ${suspendedUser.username} suspendu.`, user: suspendedUser });
  } catch (error: any) {
    console.error("Erreur suspension utilisateur:", error);
    res.status(500).json({ message: error.message || 'Erreur serveur' });
  }
});

// Compléter le profil chasseur de l'utilisateur connecté (continuation d'inscription)
router.put('/me/hunter-profile', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const userId = currentUser?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    // Validation Zod des données chasseur
    const completeHunterProfileSchema = z.object({
      firstName: z.string().min(1, 'Prénom requis'),
      lastName: z.string().min(1, 'Nom requis'),
      idNumber: z.string().min(1, 'Numéro de pièce requis'),
      phone: z.string().optional().nullable(),
      category: z.string().min(1, 'Catégorie requise'),
      pays: z.string().min(1, 'Pays requis'),
      nationality: z.string().optional().nullable(),
      address: z.string().min(1, 'Adresse requise'),
      dateOfBirth: z.string().min(1, 'Date de naissance requise'),
      profession: z.string().min(1, 'Profession requise'),
      experience: z.coerce.number().nonnegative('Expérience invalide').default(0),
      region: z.string().optional().nullable(),
      departement: z.string().optional().nullable(),
      weaponType: z.any().optional().nullable(),
      weaponBrand: z.string().optional().nullable(),
      weaponReference: z.string().optional().nullable(),
      weaponCaliber: z.string().optional().nullable(),
      weaponOtherDetails: z.string().optional().nullable(),
      isMinor: z.boolean().optional(),
    });

    const hunterData = completeHunterProfileSchema.parse(req.body);

    // Unicité: refuser si un chasseur avec cet idNumber existe déjà
    try {
      const existing = await storage.getHunterByIdNumber(hunterData.idNumber);
      if (existing) {
        return res.status(409).json({
          message: "Ce numéro de pièce d'identité est déjà utilisé par un autre chasseur.",
          field: 'idNumber',
          code: 'HUNTER_ID_NUMBER_DUPLICATE',
        });
      }
    } catch (_) {
      // On ignore et laisse la contrainte DB/le POST renvoyer une erreur au besoin
    }

    // Créer le profil chasseur via storage avec les données validées
    const createdHunter = await storage.createHunter({
      firstName: hunterData.firstName,
      lastName: hunterData.lastName,
      idNumber: hunterData.idNumber,
      phone: hunterData.phone ?? undefined,
      category: hunterData.category,
      pays: hunterData.pays ?? null,
      nationality: hunterData.nationality ?? null,
      address: hunterData.address,
      dateOfBirth: hunterData.dateOfBirth,
      profession: hunterData.profession,
      experience: Number(hunterData.experience) || 0,
      region: hunterData.region ?? null,
      departement: hunterData.departement ?? null,
      weaponType: hunterData.weaponType ?? null,
      weaponBrand: hunterData.weaponBrand ?? null,
      weaponReference: hunterData.weaponReference ?? null,
      weaponCaliber: hunterData.weaponCaliber ?? null,
      weaponOtherDetails: hunterData.weaponOtherDetails ?? null,
      isMinor: Boolean(hunterData.isMinor),
    });

    // Associer le chasseur à l'utilisateur
    await storage.assignHunterToUser(userId, createdHunter.id);

    // Mettre à jour la session pour refléter immédiatement le hunterId côté client
    try {
      if (req.session && req.session.user) {
        (req.session.user as any).hunterId = createdHunter.id;
        await new Promise<void>((resolve, reject) => {
          req.session!.save((err) => (err ? reject(err) : resolve()));
        });
      }
    } catch (sessErr) {
      console.warn('[users.routes] Impossible de mettre à jour hunterId dans la session:', sessErr);
      // Continuer malgré tout: la réponse inclut l'ID créé
    }

    // Historique
    await storage.createHistory({
      userId: userId,
      operation: 'complete_hunter_profile',
      entityType: 'user',
      entityId: userId,
      details: `Profil chasseur complété pour l'utilisateur ID ${userId}, chasseur ID ${createdHunter.id}`
    });

    res.json({
      id: createdHunter.id,
      message: 'Profil chasseur complété avec succès',
      hunter: createdHunter
    });

  } catch (error: any) {
    console.error('Erreur lors de la complétion du profil chasseur:', error);
    res.status(500).json({
      message: 'Erreur lors de la complétion du profil chasseur',
      error: error.message
    });
  }
});

export default router;
