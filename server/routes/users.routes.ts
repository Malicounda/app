// @ts-nocheck
import bcrypt from 'bcryptjs';
import { and, count, asc as dslAsc, desc as dslDesc, eq, ilike, isNotNull, or, SQL } from 'drizzle-orm';
import express, { Request, Router } from 'express';
import { z } from 'zod';
import { agents, insertUserSchema as baseInsertUserSchema, domaines, userDomains, userRoleEnum, users as usersTableSchema } from '../../shared/schema.js';
import { db } from '../db.js';
import { getDepartementCentroid, getRegionCentroid } from '../lib/geoAgentLookup.js';
import { isAdmin, isAdminAgentOrSubAgent } from '../src/middleware/roles.ts';
import { DatabaseStorage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const storage = new DatabaseStorage();
const router: Router = express.Router();

// Sous-agents créés par un agent secteur (Brigade/Triage/Poste de contrôle)
router.get('/sector-subagents', isAuthenticated, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const role = String(currentUser?.role || '');
    const isSectorCreator =
      role === 'sub-agent' ||
      (role === 'agent' && String((currentUser as any)?.type || '').toLowerCase() === 'secteur');
    if (!isSectorCreator) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const rows = await db
      .select({
        id: usersTableSchema.id,
        username: usersTableSchema.username,
        email: usersTableSchema.email,
        firstName: usersTableSchema.firstName,
        lastName: usersTableSchema.lastName,
        phone: usersTableSchema.phone,
        matricule: usersTableSchema.matricule,
        role: usersTableSchema.role,
        region: usersTableSchema.region,
        departement: usersTableSchema.departement,
        commune: (usersTableSchema as any).commune,
        arrondissement: (usersTableSchema as any).arrondissement,
        sousService: (usersTableSchema as any).sousService,
        createdAt: usersTableSchema.createdAt,
      })
      .from(usersTableSchema)
      .where(
        and(
          eq((usersTableSchema as any).createdByUserId, Number(currentUser.id)),
          or(
            eq(usersTableSchema.role, 'brigade' as any),
            eq(usersTableSchema.role, 'triage' as any),
            eq(usersTableSchema.role, 'poste-control' as any),
            eq(usersTableSchema.role, 'sous-secteur' as any),
          ),
        ),
      )
      .orderBy(dslDesc(usersTableSchema.createdAt));

    return res.json(rows);
  } catch (e: any) {
    console.error('Erreur sector-subagents:', e);
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
});

// Define a type for User selection, useful for typing results
type User = typeof usersTableSchema.$inferSelect;

// Schéma Zod pour la création d'un agent
const createAgentSchema = baseInsertUserSchema.extend({
  username: z.string().min(3, "Le nom d'utilisateur de l'agent doit contenir au moins 3 caractères."),
  email: z.string().email("L'email de l'agent n'est pas valide."),
  password: z.string().min(6, "Le mot de passe de l'agent doit contenir au moins 6 caractères."),
  grade: z.string().optional(),
  genre: z.string().optional(),
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

// Pré-remplissage : récupérer le profil agent (table agents) par matricule
router.get('/agent-profile-by-matricule/:matricule', isAuthenticated, isAdminAgentOrSubAgent, async (req, res) => {
  try {
    const matricule = String(req.params.matricule || '').trim();
    if (!matricule) return res.status(400).json({ message: 'Matricule requis' });

    const rows = await db
      .select({
        idAgent: agents.idAgent,
        userId: agents.userId,
        matriculeSol: agents.matriculeSol,
        nom: agents.nom,
        prenom: agents.prenom,
        grade: agents.grade,
        genre: agents.genre,
        contact: agents.contact,
        username: usersTableSchema.username,
        email: usersTableSchema.email,
        phone: usersTableSchema.phone,
      })
      .from(agents)
      .leftJoin(usersTableSchema, eq(agents.userId as any, usersTableSchema.id as any))
      .where(eq(agents.matriculeSol as any, matricule as any))
      .limit(1);

    const r: any = rows?.[0];
    if (!r) return res.status(404).json({ message: 'Agent non trouvé' });

    return res.json({
      matriculeSol: r.matriculeSol ?? null,
      firstName: r.prenom ?? null,
      lastName: r.nom ?? null,
      grade: r.grade ?? null,
      genre: r.genre ?? null,
      email: (r?.contact?.email ?? r.email) ?? null,
      phone: (r?.contact?.telephone ?? r.phone) ?? null,
    });
  } catch (e: any) {
    console.error('Erreur agent-profile-by-matricule:', e);
    return res.status(500).json({ message: e?.message || 'Erreur serveur' });
  }
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
  domaineId?: string;
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

    const ensureUserActive = async (userId: number) => {
      try {
        // Certains environnements utilisent users.active, d'autres users.isActive.
        // On tente de mettre les deux à true; les colonnes inexistantes seront ignorées par storage.updateUser.
        await storage.updateUser(userId, { active: true as any, isActive: true as any } as any);
      } catch (e) {
        // Ne pas bloquer la création/affectation si l'activation échoue
        console.warn('[create-agent] failed to activate user', userId, e);
      }
    };

    const ensureDomainAssignment = async (userId: number, domainName: string, roleForDomain: string | null) => {
      const normalized = String(domainName || '').trim().toUpperCase();
      if (!normalized) return;
      const list = await storage.getUserDomainsByUserId(userId);
      const match = Array.isArray(list)
        ? (list as any[]).find((d) => String(d?.domain || '').toUpperCase() === normalized)
        : undefined;
      if (match) {
        if ((match as any).active === false) {
          await storage.updateUserDomain(Number((match as any).id), { active: true } as any);
        }
        await ensureUserActive(userId);
        return;
      }
      // Essayer de renseigner domaineId si possible (certaines bases ont des user_domains sans domaineId)
      let domaineId: number | null = null;
      try {
        const dRows = await db
          .select({ id: domaines.id })
          .from(domaines)
          .where(eq(domaines.nomDomaine as any, normalized as any))
          .limit(1);
        if (dRows?.[0]?.id) domaineId = Number(dRows[0].id);
      } catch {
        // ignore
      }

      await storage.createUserDomain({ userId, domain: normalized, domaineId: domaineId ?? null, role: roleForDomain ?? null, active: true } as any);
      await ensureUserActive(userId);
    };

    const getExistingUserByMatriculeOrAgentRegistry = async (matricule: string) => {
      const m = String(matricule || '').trim();
      if (!m) return null;
      const byUserMatricule = await storage.getUserByMatricule(m);
      if (byUserMatricule) return byUserMatricule as any;

      // fallback: certains agents existent uniquement dans la table agents (matriculeSol)
      const found = await db
        .select({ userId: agents.userId })
        .from(agents)
        .where(eq(agents.matriculeSol as any, m as any))
        .limit(1);
      const uid = found?.[0]?.userId ? Number(found[0].userId) : null;
      if (!uid) return null;
      const u = await storage.getUser(uid);
      return (u || null) as any;
    };

    // Normalisation douce de l'entrée pour réduire les erreurs de validation côté client
    const rawBody: any = req.body || {};
    const normalizedBody: any = {
      ...rawBody,
      username: typeof rawBody.username === 'string' ? rawBody.username.trim() : rawBody.username,
      email: typeof rawBody.email === 'string' ? rawBody.email.trim() : rawBody.email,
      firstName: typeof rawBody.firstName === 'string' ? rawBody.firstName.trim() : rawBody.firstName,
      lastName: typeof rawBody.lastName === 'string' ? rawBody.lastName.trim() : rawBody.lastName,
      phone: typeof rawBody.phone === 'string' ? (rawBody.phone.trim() || undefined) : rawBody.phone,
      matricule: typeof rawBody.matricule === 'string' ? (rawBody.matricule.trim() || undefined) : rawBody.matricule,
      serviceLocation: typeof rawBody.serviceLocation === 'string' ? (rawBody.serviceLocation.trim() || undefined) : rawBody.serviceLocation,
      commune: typeof rawBody.commune === 'string' ? (rawBody.commune.trim() || undefined) : rawBody.commune,
      arrondissement: typeof rawBody.arrondissement === 'string' ? (rawBody.arrondissement.trim() || undefined) : rawBody.arrondissement,
      sousService: typeof rawBody.sousService === 'string' ? (rawBody.sousService.trim() || undefined) : (typeof rawBody.sous_service === 'string' ? (rawBody.sous_service.trim() || undefined) : rawBody.sous_service),
      // Accepter 'zone' en entrée et le mapper vers 'departement' si manquant
      departement: rawBody.departement ?? rawBody.zone ?? undefined,
      region: typeof rawBody.region === 'string' ? (rawBody.region.trim() || undefined) : rawBody.region,
      // Normaliser le rôle: accepter variantes et minuscules
      role: (() => {
        const r = typeof rawBody.role === 'string' ? rawBody.role.trim().toLowerCase() : rawBody.role;
        if (!r) return undefined;
        if (['agent', 'admin', 'hunter', 'sub-agent', 'hunting-guide', 'brigade', 'triage', 'poste-control', 'sous-secteur'].includes(r)) return r;
        if (['subagent', 'sub_agent', 'secteur', 'sector', 'sous-agent', 'sous agent'].includes(r)) return 'sub-agent';
        if (['regional', 'iref'].includes(r)) return 'agent';
        return r; // laisser passer, Zod tranchera si invalide
      })(),
      // Coercion légère pour les coordonnées éventuellement passées en chaîne
      agentLat: rawBody.agentLat !== undefined ? Number(rawBody.agentLat) : (rawBody.agent_lat !== undefined ? Number(rawBody.agent_lat) : undefined),
      agentLon: rawBody.agentLon !== undefined ? Number(rawBody.agentLon) : (rawBody.agent_lon !== undefined ? Number(rawBody.agent_lon) : undefined),
    };

    const isSectorCreator =
      String(currentUser?.role || '') === 'sub-agent' ||
      (String(currentUser?.role || '') === 'agent' && String((currentUser as any)?.type || '').toLowerCase() === 'secteur');
    const isSectorSubRole = ['brigade', 'triage', 'poste-control', 'sous-secteur'].includes(String(normalizedBody?.role || ''));

    if (isSectorCreator && isSectorSubRole) {
      const validatedData = createAgentSchema.parse(normalizedBody);
      const requestedDomain = String(validatedData.domain || headerDomain || 'CHASSE');

      if (!currentUser?.region || !currentUser?.departement) {
        return res.status(400).json({ message: "Votre compte n'a pas de région/département configuré." });
      }

      // Forcer le périmètre (même région + même département)
      validatedData.region = currentUser.region;
      validatedData.departement = currentUser.departement;
      validatedData.serviceLocation = validatedData.serviceLocation ?? 'Secteur';

      const orConditions: SQL[] = [
        eq(usersTableSchema.username, validatedData.username),
        eq(usersTableSchema.email, validatedData.email),
      ];
      if (validatedData.matricule) {
        orConditions.push(eq(usersTableSchema.matricule, validatedData.matricule));
      }
      const existingUser = await db.query.users.findFirst({ where: or(...orConditions) });
      if (existingUser) {
        let field = 'Nom d`utilisateur ou email';
        if (validatedData.matricule && existingUser.matricule === validatedData.matricule) field = 'Matricule';
        return res.status(400).json({ message: `${field} déjà utilisé.` });
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      const deptCoords = getDepartementCentroid(validatedData.departement);

      const insertValues = {
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        phone: validatedData.phone,
        matricule: validatedData.matricule,
        serviceLocation: validatedData.serviceLocation,
        region: validatedData.region,
        departement: validatedData.departement,
        commune: (validatedData as any).commune ?? null,
        arrondissement: (validatedData as any).arrondissement ?? null,
        sousService: (validatedData as any).sousService ?? null,
        createdByUserId: Number(currentUser.id),
        role: validatedData.role as any,
        isActive: true,
        agentLat: normalizedBody.agentLat ?? (deptCoords ? (deptCoords.lat as any) : undefined),
        agentLon: normalizedBody.agentLon ?? (deptCoords ? (deptCoords.lon as any) : undefined),
      };

      const [created] = await db.insert(usersTableSchema).values(insertValues as any).returning();

      try {
        await db
          .insert(agents)
          .values({
            userId: created.id as any,
            matriculeSol: String(validatedData.matricule || created.matricule || created.username || '').trim() || null,
            nom: validatedData.lastName ?? null,
            prenom: validatedData.firstName ?? null,
            grade: (validatedData as any).grade ?? null,
            genre: (validatedData as any).genre ?? null,
            contact: {
              telephone: validatedData.phone ?? null,
              email: validatedData.email ?? null,
            },
          } as any)
          .onConflictDoUpdate({
            target: agents.userId as any,
            set: {
              matriculeSol: String(validatedData.matricule || created.matricule || created.username || '').trim() || null,
              nom: validatedData.lastName ?? null,
              prenom: validatedData.firstName ?? null,
              grade: (validatedData as any).grade ?? null,
              genre: (validatedData as any).genre ?? null,
              contact: {
                telephone: validatedData.phone ?? null,
                email: validatedData.email ?? null,
              },
            } as any,
          });
      } catch (e) {
        console.warn('[create-agent] upsert agents failed (non-blocking):', e);
      }

      await storage.createHistory({
        userId: currentUser.id,
        operation: 'create',
        entityType: 'user',
        entityId: created.id,
        details: `Création du sous-compte ${validatedData.role} ${created.username} (ID: ${created.id}) par l'agent secteur ${currentUser.username} (ID: ${currentUser.id}).`,
      });

      await ensureDomainAssignment(created.id, requestedDomain, String(validatedData.role));

      return res.status(201).json({
        id: created.id,
        username: created.username,
        email: created.email,
        role: created.role,
        matricule: created.matricule,
        region: created.region,
        departement: (created as any).departement,
        commune: (created as any).commune,
        arrondissement: (created as any).arrondissement,
        sousService: (created as any).sousService,
      } as any);
    }

    // ADMIN: peut tout faire (logique directement ci-dessous après le if/else)
    if (currentUser.role === 'agent') {
      // AGENT: peut créer uniquement des sub-agents pour sa région
      const validatedData = createAgentSchema.parse(normalizedBody);
      const requestedDomain = String(validatedData.domain || headerDomain || 'CHASSE');

      if (validatedData.matricule) {
        const existingByMatricule = await getExistingUserByMatriculeOrAgentRegistry(validatedData.matricule);
        if (existingByMatricule) {
          const existingUserId = Number((existingByMatricule as any).id);
          const domains = await storage.getUserDomainsByUserId(existingUserId);
          const normalized = String(requestedDomain || '').trim().toUpperCase();
          const hasRequested = Array.isArray(domains)
            ? (domains as any[]).some((d) => String(d?.domain || '').toUpperCase() === normalized)
            : false;
          const hasAny = Array.isArray(domains) ? (domains as any[]).length > 0 : false;

          // Si l'agent n'a encore aucun domaine, on peut l'affecter sans confirmation
          // Si le domaine demandé est déjà présent, idem (pas besoin de confirmer)
          if (!validatedData.confirmExisting && hasAny && !hasRequested) {
            return res.status(409).json({
              message: "Un agent avec ce matricule existe déjà. Confirmez pour l'affecter à ce domaine.",
              code: 'AGENT_EXISTS',
              existingUser: { id: existingUserId, username: (existingByMatricule as any).username },
            });
          }

          // Mettre à jour le compte existant pour correspondre à une création d'agent secteur
          // (username + password + role + région + département + lieu de service)
          let usernameToSet = String(validatedData.username || '').trim();
          if (usernameToSet && usernameToSet !== String((existingByMatricule as any).username || '')) {
            const other = await db.query.users.findFirst({
              where: eq(usersTableSchema.username, usernameToSet),
            });
            if (other && Number((other as any).id) !== existingUserId) {
              usernameToSet = `${usernameToSet}_${existingUserId}`;
            }
          }

          const hashedPassword = validatedData.password ? await bcrypt.hash(validatedData.password, 10) : undefined;

          await db
            .update(usersTableSchema)
            .set({
              username: usernameToSet || (existingByMatricule as any).username,
              password: hashedPassword as any,
              firstName: validatedData.firstName ?? (existingByMatricule as any).firstName ?? null,
              lastName: validatedData.lastName ?? (existingByMatricule as any).lastName ?? null,
              email: validatedData.email ?? (existingByMatricule as any).email,
              phone: validatedData.phone ?? (existingByMatricule as any).phone ?? null,
              role: 'sub-agent' as any,
              serviceLocation: 'Secteur' as any,
              region: currentUser.region as any,
              departement: validatedData.departement as any,
              isActive: true as any,
            } as any)
            .where(eq(usersTableSchema.id as any, existingUserId as any));

          try {
            await db
              .insert(agents)
              .values({
                userId: existingUserId as any,
                matriculeSol: String(validatedData.matricule || '').trim() || null,
                nom: validatedData.lastName ?? null,
                prenom: validatedData.firstName ?? null,
                grade: (validatedData as any).grade ?? null,
                genre: (validatedData as any).genre ?? null,
                contact: {
                  telephone: validatedData.phone ?? null,
                  email: validatedData.email ?? null,
                },
              } as any)
              .onConflictDoUpdate({
                target: agents.userId as any,
                set: {
                  matriculeSol: String(validatedData.matricule || '').trim() || null,
                  nom: validatedData.lastName ?? null,
                  prenom: validatedData.firstName ?? null,
                  grade: (validatedData as any).grade ?? null,
                  genre: (validatedData as any).genre ?? null,
                  contact: {
                    telephone: validatedData.phone ?? null,
                    email: validatedData.email ?? null,
                  },
                } as any,
              });
          } catch (e) {
            console.warn('[create-agent] upsert agents failed (non-blocking):', e);
          }

          await ensureDomainAssignment(existingUserId, requestedDomain, 'sub-agent');
          return res.status(200).json({
            message: "Affectation ajoutée.",
            user: { id: existingUserId, username: (existingByMatricule as any).username },
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
        agentLat: normalizedBody.agentLat ?? (deptCoords ? (deptCoords.lat as any) : undefined),
        agentLon: normalizedBody.agentLon ?? (deptCoords ? (deptCoords.lon as any) : undefined),
      };
      const [createdSub] = await db.insert(usersTableSchema)
        .values(insertValues as any)
        .returning();

      try {
        await db
          .insert(agents)
          .values({
            userId: createdSub.id as any,
            matriculeSol: String(validatedData.matricule || createdSub.matricule || createdSub.username || '').trim() || null,
            nom: validatedData.lastName ?? null,
            prenom: validatedData.firstName ?? null,
            grade: (validatedData as any).grade ?? null,
            genre: (validatedData as any).genre ?? null,
            contact: {
              telephone: validatedData.phone ?? null,
              email: validatedData.email ?? null,
            },
          } as any)
          .onConflictDoUpdate({
            target: agents.userId as any,
            set: {
              matriculeSol: String(validatedData.matricule || createdSub.matricule || createdSub.username || '').trim() || null,
              nom: validatedData.lastName ?? null,
              prenom: validatedData.firstName ?? null,
              grade: (validatedData as any).grade ?? null,
              genre: (validatedData as any).genre ?? null,
              contact: {
                telephone: validatedData.phone ?? null,
                email: validatedData.email ?? null,
              },
            } as any,
          });
      } catch (e) {
        console.warn('[create-agent] upsert agents failed (non-blocking):', e);
      }

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
      await ensureDomainAssignment(newUser.id, requestedDomain, 'sub-agent');
      return res.status(201).json(newUser);
    }

    // ADMIN: peut tout faire
    const validatedData = createAgentSchema.parse(normalizedBody);
    const requestedDomain = String(validatedData.domain || headerDomain || 'CHASSE');

    if (validatedData.matricule) {
      const existingByMatricule = await getExistingUserByMatriculeOrAgentRegistry(validatedData.matricule);
      if (existingByMatricule) {
        const existingUserId = Number((existingByMatricule as any).id);
        const domains = await storage.getUserDomainsByUserId(existingUserId);
        const normalized = String(requestedDomain || '').trim().toUpperCase();
        const hasRequested = Array.isArray(domains)
          ? (domains as any[]).some((d) => String(d?.domain || '').toUpperCase() === normalized)
          : false;
        const hasAny = Array.isArray(domains) ? (domains as any[]).length > 0 : false;

        if (!validatedData.confirmExisting && hasAny && !hasRequested) {
          return res.status(409).json({
            message: "Un agent avec ce matricule existe déjà. Confirmez pour l'affecter à ce domaine.",
            code: 'AGENT_EXISTS',
            existingUser: { id: existingUserId, username: (existingByMatricule as any).username },
          });
        }

        // Déterminer le rôle final selon la création demandée
        const roleToAssignExisting = (validatedData.role && ['agent', 'sub-agent'].includes(validatedData.role))
          ? validatedData.role
          : 'agent';

        let usernameToSet = String(validatedData.username || '').trim();
        if (usernameToSet && usernameToSet !== String((existingByMatricule as any).username || '')) {
          const other = await db.query.users.findFirst({
            where: eq(usersTableSchema.username, usernameToSet),
          });
          if (other && Number((other as any).id) !== existingUserId) {
            usernameToSet = `${usernameToSet}_${existingUserId}`;
          }
        }

        const hashedPassword = validatedData.password ? await bcrypt.hash(validatedData.password, 10) : undefined;

        await db
          .update(usersTableSchema)
          .set({
            username: usernameToSet || (existingByMatricule as any).username,
            password: hashedPassword as any,
            firstName: validatedData.firstName ?? (existingByMatricule as any).firstName ?? null,
            lastName: validatedData.lastName ?? (existingByMatricule as any).lastName ?? null,
            email: validatedData.email ?? (existingByMatricule as any).email,
            phone: validatedData.phone ?? (existingByMatricule as any).phone ?? null,
            role: roleToAssignExisting as any,
            serviceLocation: roleToAssignExisting === 'sub-agent' ? 'Secteur' : (validatedData.serviceLocation ?? (existingByMatricule as any).serviceLocation ?? null),
            region: roleToAssignExisting === 'sub-agent'
              ? ((validatedData.region ?? currentUser?.region) as any)
              : ((validatedData.region ?? (existingByMatricule as any).region) as any),
            departement: roleToAssignExisting === 'sub-agent' ? (validatedData.departement as any) : null,
            isActive: true as any,
          } as any)
          .where(eq(usersTableSchema.id as any, existingUserId as any));

        try {
          await db
            .insert(agents)
            .values({
              userId: existingUserId as any,
              matriculeSol: String(validatedData.matricule || '').trim() || null,
              nom: validatedData.lastName ?? null,
              prenom: validatedData.firstName ?? null,
              grade: (validatedData as any).grade ?? null,
              genre: (validatedData as any).genre ?? null,
              contact: {
                telephone: validatedData.phone ?? null,
                email: validatedData.email ?? null,
              },
            } as any)
            .onConflictDoUpdate({
              target: agents.userId as any,
              set: {
                matriculeSol: String(validatedData.matricule || '').trim() || null,
                nom: validatedData.lastName ?? null,
                prenom: validatedData.firstName ?? null,
                grade: (validatedData as any).grade ?? null,
                genre: (validatedData as any).genre ?? null,
                contact: {
                  telephone: validatedData.phone ?? null,
                  email: validatedData.email ?? null,
                },
              } as any,
            });
        } catch (e) {
          console.warn('[create-agent] upsert agents failed (non-blocking):', e);
        }

        const roleForDomain = String(((existingByMatricule as any).role || validatedData.role || 'agent') as any);
        await ensureDomainAssignment(existingUserId, requestedDomain, roleForDomain);
        return res.status(200).json({
          message: "Affectation ajoutée.",
          user: { id: existingUserId, username: (existingByMatricule as any).username },
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
      agentLat: normalizedBody.agentLat ?? (autoLat as any),
      agentLon: normalizedBody.agentLon ?? (autoLon as any),
    };

    const [createdRow] = await db.insert(usersTableSchema)
      .values(insertValues as any)
      .returning();

    try {
      await db
        .insert(agents)
        .values({
          userId: createdRow.id as any,
          matriculeSol: String(validatedData.matricule || createdRow.matricule || createdRow.username || '').trim() || null,
          nom: validatedData.lastName ?? null,
          prenom: validatedData.firstName ?? null,
          grade: (validatedData as any).grade ?? null,
          genre: (validatedData as any).genre ?? null,
          contact: {
            telephone: validatedData.phone ?? null,
            email: validatedData.email ?? null,
          },
        } as any)
        .onConflictDoUpdate({
          target: agents.userId as any,
          set: {
            matriculeSol: String(validatedData.matricule || createdRow.matricule || createdRow.username || '').trim() || null,
            nom: validatedData.lastName ?? null,
            prenom: validatedData.firstName ?? null,
            grade: (validatedData as any).grade ?? null,
            genre: (validatedData as any).genre ?? null,
            contact: {
              telephone: validatedData.phone ?? null,
              email: validatedData.email ?? null,
            },
          } as any,
        });
    } catch (e) {
      console.warn('[create-agent] upsert agents failed (non-blocking):', e);
    }

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

    await ensureDomainAssignment(newUser.id, requestedDomain, String(newUser.role || roleToAssign));

    res.status(201).json(newUser);

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[create-agent] Validation errors:', JSON.stringify(error.errors, null, 2));
      // Remonter des erreurs plus structurées pour le client
      return res.status(422).json({
        message: "Erreur de validation",
        errors: error.errors?.map(e => ({ path: e.path?.join('.'), message: e.message, code: e.code })) ?? [],
      });
    }
    console.error("Erreur lors de la création de l'agent:", error);
    res.status(500).json({ message: error.message || "Erreur interne du serveur" });
  }
});

// Route pour récupérer les agents (régionaux et de secteur)
router.get('/agents', isAuthenticated, isAdminAgentOrSubAgent, async (req: Request<{}, {}, {}, UserListQuery>, res) => {
  try {
    const {
      page = '1',
      limit = '10',
      search = '',
      role = '',
      region = '',
      zone = '',
      domaineId = '',
      sortBy = 'username',
      order = 'asc'
    } = req.query;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const offset = (pageNumber - 1) * limitNumber;

    const currentUser = req.user as any;
    const currentRole = String(currentUser?.role || '').toLowerCase();

    // Determine domaineId filter: explicit param, or auto-detect from logged-in admin's domain
    let effectiveDomaineId: number | null = null;
    if (domaineId) {
      const parsed = parseInt(domaineId, 10);
      if (parsed > 0) effectiveDomaineId = parsed;
    } else if (currentRole === 'admin' || currentRole === 'agent' || currentRole === 'sub-agent') {
      // Auto-detect: find the logged-in user's active domain assignment
      const myDomains = await storage.getUserDomainsByUserId(Number(currentUser.id));
      if (Array.isArray(myDomains) && myDomains.length > 0) {
        const activeDomain = (myDomains as any[]).find((d: any) => d.active !== false);
        if (activeDomain?.domaineId) effectiveDomaineId = Number(activeDomain.domaineId);
        else if (activeDomain?.domain) {
          // Lookup domaineId from domain name
          const domainRow = await db.select({ id: domaines.id }).from(domaines)
            .where(eq(domaines.nomDomaine, activeDomain.domain as any)).limit(1);
          if (domainRow?.[0]?.id) effectiveDomaineId = Number(domainRow[0].id);
        }
      }
    }

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

    // Restreindre la portée pour les rôles non administrateurs
    if (currentRole !== 'admin') {
      if (!currentUser?.region) {
        return res.status(403).json({ message: "Votre région est indéterminée, accès refusé." });
      }
      conditions.push(eq(usersTableSchema.region, currentUser.region));
      if (currentRole === 'sub-agent' && currentUser?.departement) {
        conditions.push(eq(usersTableSchema.departement, currentUser.departement));
      }
    }

    // Domain filtering: when effectiveDomaineId is set, only return agents assigned to that domain
    // Important: some records may only have user_domains.domain set (domaineId can be null)
    if (effectiveDomaineId) {
      const dRows = await db
        .select({ nomDomaine: domaines.nomDomaine })
        .from(domaines)
        .where(eq(domaines.id as any, effectiveDomaineId as any))
        .limit(1);
      const effectiveDomainName = String(dRows?.[0]?.nomDomaine || '').trim().toUpperCase();

      const domainAgentUserIds = await db
        .select({ userId: userDomains.userId })
        .from(userDomains)
        .where(and(
          eq(userDomains.active as any, true as any),
          or(
            eq(userDomains.domaineId as any, effectiveDomaineId as any),
            effectiveDomainName ? eq(userDomains.domain as any, effectiveDomainName as any) : undefined,
          )!
        ));

      const allowedUserIds = domainAgentUserIds
        .map((r: any) => Number(r.userId))
        .filter((v: any) => Number.isFinite(v));
      if (allowedUserIds.length > 0) {
        conditions.push(or(...allowedUserIds.map((uid: number) => eq(usersTableSchema.id, uid as any)))!);
      } else {
        // No agents in this domain → return empty
        return res.json({ data: [], pagination: { page: pageNumber, limit: limitNumber, total: 0, totalPages: 0 } });
      }
    }

    const sortOrderFunction = order === 'desc' ? dslDesc : dslAsc;
    const orderByField = usersTableSchema[sortBy] || usersTableSchema.username;

    const agentUsers = await db
      .select({
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
        createdAt: usersTableSchema.createdAt,
        lastLogin: usersTableSchema.lastLogin,
        updatedAt: usersTableSchema.updatedAt,
        grade: agents.grade,
        genre: agents.genre,
      })
      .from(usersTableSchema)
      .leftJoin(agents, eq(agents.userId as any, usersTableSchema.id as any))
      .where(and(...conditions))
      .orderBy(sortOrderFunction(orderByField))
      .limit(limitNumber)
      .offset(offset);

    const totalAgents = await db.select({ count: count() }).from(usersTableSchema).where(and(...conditions));

    // Ajouter le libellé harmonisé du rôle métier
    const agentsWithLabels = agentUsers.map((agent: any) => ({
      ...agent,
      roleMetierCode: agent.role === 'agent' ? 'AGENT_REGIONAL' : agent.role === 'sub-agent' ? 'AGENT_SECTEUR' : (agent.role || '').toUpperCase(),
      roleMetierLabel: agent.role === 'agent' ? 'Agent régional' : agent.role === 'sub-agent' ? 'Agent secteur' : agent.role,
    }));

    res.json({
      data: agentsWithLabels,
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

    // Interdire la suppression des super admins et des admins (même par un admin)
    let isSuperAdmin = false;
    try {
      isSuperAdmin = await storage.isSuperAdmin(Number(userId));
    } catch (e) {
      // Si la vérification échoue, on préfère bloquer plutôt que risquer une suppression accidentelle
      return res.status(500).json({ message: "Erreur lors de la vérification du statut Super Admin" });
    }

    if (isSuperAdmin) {
      return res.status(403).json({ message: "Suppression interdite: ce compte est Super Admin" });
    }

    if (String((user as any).role || '').toLowerCase() === 'admin') {
      return res.status(403).json({ message: "Suppression interdite: suppression des comptes admin désactivée" });
    }

    // Suppression réelle (passe par storage pour gérer les dépendances)
    const ok = await storage.deleteUser(Number(userId));
    if (!ok) {
      return res.status(400).json({ message: "Suppression impossible" });
    }

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
    const rawBody = (req.body || {}) as any;
    const rawGrade = rawBody?.grade;
    const rawGenre = rawBody?.genre;

    // Bloquer les mises à jour sensibles sur comptes protégés (Super Admin / Admin)
    const targetUser = await db.query.users.findFirst({
      where: eq(usersTableSchema.id, userIdToUpdate),
    });

    if (!targetUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    let targetIsSuperAdmin = false;
    try {
      targetIsSuperAdmin = await storage.isSuperAdmin(Number(userIdToUpdate));
    } catch (e) {
      return res.status(500).json({ message: "Erreur lors de la vérification du statut Super Admin" });
    }

    const targetIsAdmin = String((targetUser as any).role || '').toLowerCase() === 'admin';
    const isProtectedTarget = targetIsSuperAdmin || targetIsAdmin;

    if (isProtectedTarget) {
      const raw: any = req.body || {};
      const triesToChangeRole = validatedData.role !== undefined;
      const triesToChangeIsActive = raw.isActive !== undefined || raw.is_active !== undefined;
      const triesToChangeActive = raw.active !== undefined;
      const triesToChangeSuspended = raw.isSuspended !== undefined || raw.is_suspended !== undefined;

      if (triesToChangeRole || triesToChangeIsActive || triesToChangeActive || triesToChangeSuspended) {
        return res.status(403).json({ message: "Mise à jour interdite: compte protégé (admin/super admin)" });
      }
    }

    // Interdire le changement de rôle pour les chasseurs et guides de chasse
    if (validatedData.role !== undefined) {
      const currentRole = String((targetUser as any).role || '').toLowerCase();
      if (currentRole === 'hunter' || currentRole === 'hunting-guide') {
        return res.status(403).json({ message: "Mise à jour interdite: changement de rôle interdit pour les chasseurs et guides" });
      }
    }

    if (currentUser.id !== userIdToUpdate && currentUser.role !== 'admin') {
      if (currentUser.role !== 'agent') {
        return res.status(403).json({ message: "Non autorisé à mettre à jour cet utilisateur." });
      }

      const raw = req.body as any;
      const keys = Object.keys(raw);
      const unauthorizedKey = keys.find((k) => k !== 'password');
      if (unauthorizedKey) {
        return res.status(403).json({ message: "Non autorisé à mettre à jour cet utilisateur." });
      }

      const [targetUser] = await db
        .select({ id: usersTableSchema.id, role: usersTableSchema.role, region: usersTableSchema.region })
        .from(usersTableSchema)
        .where(eq(usersTableSchema.id, userIdToUpdate));

      if (!targetUser) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }

      if (targetUser.role !== 'sub-agent' || targetUser.region !== currentUser.region) {
        return res.status(403).json({ message: "Non autorisé à mettre à jour cet utilisateur." });
      }
    }

    if (currentUser.role !== 'admin') {
      const raw = req.body as any;
      if (validatedData.role !== undefined || raw.isActive !== undefined || raw.isSuspended !== undefined) {
        return res.status(403).json({ message: "Vous n'êtes pas autorisé à modifier le rôle ou le statut d'activité/suspension." });
      }
    }

    // Sécurité: grade/genre sont stockés dans la table agents, donc modification uniquement par admin
    const wantsToUpdateAgentProfile = rawGrade !== undefined || rawGenre !== undefined;
    if (wantsToUpdateAgentProfile && currentUser.role !== 'admin') {
      return res.status(403).json({ message: "Non autorisé à modifier le grade/genre." });
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

    let updatedDbUser: any = null;
    if (Object.keys(updateValues).length > 0) {
      const [u] = await db.update(usersTableSchema)
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
      updatedDbUser = u;
    } else {
      // Pas de champ users à modifier, mais on peut vouloir modifier grade/genre (table agents)
      const [u] = await db
        .select({
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
        })
        .from(usersTableSchema)
        .where(eq(usersTableSchema.id, userIdToUpdate))
        .limit(1);
      updatedDbUser = u;
    }

    if (!updatedDbUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    // Mettre à jour grade/genre dans la table agents si demandé
    if (wantsToUpdateAgentProfile) {
      const agentUpdateValues: any = {};
      if (rawGrade !== undefined) agentUpdateValues.grade = String(rawGrade || '').trim() || null;
      if (rawGenre !== undefined) agentUpdateValues.genre = String(rawGenre || '').trim() || null;

      if (Object.keys(agentUpdateValues).length > 0) {
        await db
          .update(agents)
          .set(agentUpdateValues)
          .where(eq(agents.userId as any, userIdToUpdate as any));
      }
    }

    // Relire grade/genre depuis la table agents pour la réponse
    const [agentRow] = await db
      .select({ grade: agents.grade, genre: agents.genre })
      .from(agents)
      .where(eq(agents.userId as any, userIdToUpdate as any))
      .limit(1);

    const responsePayload = {
      ...updatedDbUser,
      grade: agentRow?.grade ?? null,
      genre: agentRow?.genre ?? null,
    };

    try {
      if (req.session?.user && Number((req.session.user as any)?.id) === Number(userIdToUpdate)) {
        req.session.user = {
          ...(req.session.user as any),
          id: responsePayload.id,
          username: responsePayload.username,
          email: responsePayload.email,
          firstName: responsePayload.firstName,
          lastName: responsePayload.lastName,
          phone: responsePayload.phone,
          matricule: responsePayload.matricule,
          serviceLocation: responsePayload.serviceLocation,
          role: responsePayload.role,
          region: responsePayload.region,
          departement: responsePayload.departement,
          hunterId: (responsePayload as any).hunterId,
        } as any;
      }
    } catch {}

    await storage.createHistory({
      userId: currentUser.id,
      operation: 'update',
      entityType: 'user',
      entityId: updatedDbUser.id,
      details: `Mise à jour de l'utilisateur ${updatedDbUser.username} (ID: ${updatedDbUser.id}). Champs modifiés: ${Object.keys(updateValues).join(', ')}`
    });

    res.json(responsePayload);
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
router.put('/:id/activate', isAuthenticated, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'ID utilisateur invalide' });

    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') {
      if (currentUser.role !== 'agent') {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const [targetUser] = await db
        .select({ id: usersTableSchema.id, role: usersTableSchema.role, region: usersTableSchema.region })
        .from(usersTableSchema)
        .where(eq(usersTableSchema.id, userId));

      if (!targetUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

      if (targetUser.role !== 'sub-agent' || targetUser.region !== currentUser.region) {
        return res.status(403).json({ message: "Accès refusé" });
      }
    }

    const [activatedUser] = await db.update(usersTableSchema)
      .set({ isActive: true, isSuspended: false })
      .where(eq(usersTableSchema.id, userId))
      .returning({ id: usersTableSchema.id, username: usersTableSchema.username, isActive: usersTableSchema.isActive });

    if (!activatedUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

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
router.put('/:id/suspend', isAuthenticated, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'ID utilisateur invalide' });

    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') {
      if (currentUser.role !== 'agent') {
        return res.status(403).json({ message: "Accès refusé" });
      }

      const [targetUser] = await db
        .select({ id: usersTableSchema.id, role: usersTableSchema.role, region: usersTableSchema.region })
        .from(usersTableSchema)
        .where(eq(usersTableSchema.id, userId));

      if (!targetUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

      if (targetUser.role !== 'sub-agent' || targetUser.region !== currentUser.region) {
        return res.status(403).json({ message: "Accès refusé" });
      }
    }

    const [suspendedUser] = await db.update(usersTableSchema)
      .set({ isSuspended: true, isActive: false })
      .where(eq(usersTableSchema.id, userId))
      .returning({ id: usersTableSchema.id, username: usersTableSchema.username, isSuspended: usersTableSchema.isSuspended });

    if (!suspendedUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });

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
