import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { agents, domaines, rolesMetier, userDomains, users } from '../../shared/schema.js';
import { db } from '../db.js';
import {
  findAgentByMatriculeSolKey,
  findUserByEmail,
  findUserByMatriculeKey,
} from '../lib/matriculeUtils.js';
import { storage } from '../storage.js';

const createAgentSchema = z.object({
  userMatricule: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  matriculeSol: z.string().min(1).optional(),
  nom: z.string().optional().nullable(),
  prenom: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  genre: z.enum(['H', 'F']).optional().nullable(),
  roleMetierId: z.number().int().optional().nullable(),
  contact: z.any().optional().nullable(),
  region: z.string().optional().nullable(),
  departement: z.string().optional().nullable(),
  commune: z.string().optional().nullable(),
  arrondissement: z.string().optional().nullable(),
});

const updateAgentSchema = z.object({
  matriculeSol: z.string().min(1).optional(),
  nom: z.string().optional().nullable(),
  prenom: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
  genre: z.enum(['H', 'F']).optional().nullable(),
  roleMetierId: z.number().int().optional().nullable(),
  contact: z.any().optional().nullable(),
  password: z.string().min(6).optional().nullable(),
  region: z.string().optional().nullable(),
  departement: z.string().optional().nullable(),
  commune: z.string().optional().nullable(),
  arrondissement: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
});

async function getAgentJoinedRow(idAgent: number) {
  const rows = await db
    .select({
      idAgent: agents.idAgent,
      userId: agents.userId,
      matriculeSol: agents.matriculeSol,
      nom: agents.nom,
      prenom: agents.prenom,
      grade: agents.grade,
      genre: agents.genre,
      roleMetierId: agents.roleMetierId,
      contact: agents.contact,
      createdAt: agents.createdAt,
      username: users.username,
      email: users.email,
      phone: users.phone,
      region: users.region,
      departement: users.departement,
      commune: users.commune,
      arrondissement: users.arrondissement,
      userRole: users.role,
      roleMetierLabel: rolesMetier.labelFr,
    })
    .from(agents)
    .leftJoin(users, eq(agents.userId as any, users.id as any))
    .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
    .where(eq(agents.idAgent, idAgent))
    .limit(1);
  return rows?.[0];
}

async function getAgentRowByUserId(userId: number) {
  const rows = await db
    .select({ idAgent: agents.idAgent, userId: agents.userId })
    .from(agents)
    .where(eq(agents.userId as any, userId as any))
    .limit(1);
  return rows?.[0] as any;
}

export async function deleteAgent(req: Request, res: Response) {
  try {
    const idAgent = Number(req.params.idAgent);
    if (!idAgent || !Number.isFinite(idAgent)) return res.status(400).json({ message: 'ID agent invalide' });

    const row = await db
      .select({ userId: agents.userId })
      .from(agents)
      .where(eq(agents.idAgent, idAgent))
      .limit(1);

    const userId = row?.[0]?.userId;
    if (!userId) return res.status(404).json({ message: 'Non trouvé' });

    await db.transaction(async (tx) => {
      await tx.delete(agents).where(eq(agents.idAgent, idAgent));
      await tx.delete(users).where(eq(users.id as any, userId as any));
    });

    return res.status(204).send();
  } catch (e: any) {
    console.error('Erreur deleteAgent:', e);
    return res.status(500).json({ message: e?.message || "Erreur lors de la suppression de l'agent" });
  }
}

export async function listAgents(req: Request, res: Response) {
  try {
    const superAdminIds = await storage.getSuperAdminUserIds();
    const rows = await db
      .select({
        idAgent: agents.idAgent,
        userId: agents.userId,
        matriculeSol: agents.matriculeSol,
        nom: agents.nom,
        prenom: agents.prenom,
        grade: agents.grade,
        genre: agents.genre,
        roleMetierId: agents.roleMetierId,
        contact: agents.contact,
        createdAt: agents.createdAt,
        username: users.username,
        email: users.email,
        phone: users.phone,
        region: users.region,
        departement: users.departement,
        commune: users.commune,
        arrondissement: users.arrondissement,
        userRole: users.role,
        roleMetierLabel: rolesMetier.labelFr,
      })
      .from(agents)
      .leftJoin(users, eq(agents.userId as any, users.id as any))
      .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any));

    const filteredRows = Array.isArray(superAdminIds) && superAdminIds.length > 0
      ? rows.filter((r: any) => !superAdminIds.includes(Number(r.userId)))
      : rows;

    const adminUserIds = filteredRows
      .filter((r: any) => String(r?.userRole || '').toLowerCase() === 'admin')
      .map((r: any) => Number(r.userId))
      .filter((v: any) => Number.isFinite(v));

    let adminDomainByUserId = new Map<number, string>();
    if (adminUserIds.length > 0) {
      const adminDomainRows = await db
        .select({
          userId: userDomains.userId,
          domain: userDomains.domain,
          domaineNom: domaines.nomDomaine,
        })
        .from(userDomains)
        .leftJoin(domaines, eq(userDomains.domaineId as any, domaines.id as any))
        .where(
          and(
            eq(userDomains.active as any, true as any),
            eq(userDomains.role as any, 'admin' as any),
            inArray(userDomains.userId as any, adminUserIds as any)
          )
        );

      for (const r of adminDomainRows as any[]) {
        const uid = Number(r?.userId);
        if (!adminUserIds.includes(uid)) continue;
        if (adminDomainByUserId.has(uid)) continue;
        const d = String(r?.domaineNom || r?.domain || '').trim();
        if (d) adminDomainByUserId.set(uid, d);
      }
    }

    const enrichedRows = filteredRows.map((r: any) => {
      const isAdmin = String(r?.userRole || '').toLowerCase() === 'admin';
      if (!isAdmin) return r;
      return {
        ...r,
        adminDomainName: adminDomainByUserId.get(Number(r.userId)) || null,
      };
    });

    // Inclure les admins de domaine même s'ils n'ont pas de ligne dans `agents`
    const existingUserIds = new Set(enrichedRows.map((r: any) => Number(r.userId)).filter((v: any) => Number.isFinite(v)));
    const superAdminSet = new Set((Array.isArray(superAdminIds) ? superAdminIds : []).map((v) => Number(v)));

    const adminUsersFromDomains = await db
      .select({
        userId: userDomains.userId,
        domain: userDomains.domain,
        domaineNom: domaines.nomDomaine,
        username: users.username,
        email: users.email,
        phone: users.phone,
        region: users.region,
        departement: users.departement,
        commune: users.commune,
        arrondissement: users.arrondissement,
        firstName: users.firstName,
        lastName: users.lastName,
        userRole: users.role,
      })
      .from(userDomains)
      .leftJoin(users, eq(userDomains.userId as any, users.id as any))
      .leftJoin(domaines, eq(userDomains.domaineId as any, domaines.id as any))
      .where(and(eq(userDomains.active as any, true as any), eq(userDomains.role as any, 'admin' as any)));

    const adminMissingByUserId = new Map<number, any>();
    for (const r of adminUsersFromDomains as any[]) {
      const uid = Number(r?.userId);
      if (!Number.isFinite(uid)) continue;
      if (existingUserIds.has(uid)) continue;
      if (superAdminSet.has(uid)) continue;
      if (String(r?.userRole || '').toLowerCase() !== 'admin') continue;
      if (adminMissingByUserId.has(uid)) continue;
      const domainName = String(r?.domaineNom || r?.domain || '').trim() || null;
      adminMissingByUserId.set(uid, {
        idAgent: null,
        userId: uid,
        matriculeSol: String(r?.username || '-'),
        nom: (r?.lastName ?? null) as any,
        prenom: (r?.firstName ?? null) as any,
        grade: null,
        genre: null,
        roleMetierId: null,
        contact: {
          telephone: r?.phone ?? null,
          email: r?.email ?? null,
        },
        createdAt: new Date().toISOString(),
        username: r?.username ?? null,
        email: r?.email ?? null,
        phone: r?.phone ?? null,
        region: r?.region ?? null,
        departement: r?.departement ?? null,
        commune: r?.commune ?? null,
        arrondissement: r?.arrondissement ?? null,
        userRole: r?.userRole ?? 'admin',
        roleMetierLabel: null,
        adminDomainName: domainName,
      });
    }

    return res.json([...Array.from(adminMissingByUserId.values()), ...enrichedRows]);
  } catch (e: any) {
    console.error('Erreur listAgents:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération des agents' });
  }
}

export async function upsertAgentByUser(req: Request, res: Response) {
  try {
    const userId = Number(req.params.userId);
    if (!userId || !Number.isFinite(userId)) return res.status(400).json({ message: 'ID user invalide' });

    const parsed = updateAgentSchema.parse(req.body);
    const updateData: any = {};

    if (parsed.matriculeSol !== undefined) updateData.matriculeSol = parsed.matriculeSol;
    if (parsed.nom !== undefined) updateData.nom = parsed.nom;
    if (parsed.prenom !== undefined) updateData.prenom = parsed.prenom;
    if (parsed.grade !== undefined) updateData.grade = parsed.grade;
    if (parsed.genre !== undefined) updateData.genre = parsed.genre;
    if (parsed.roleMetierId !== undefined) updateData.roleMetierId = parsed.roleMetierId;
    if (parsed.contact !== undefined) updateData.contact = parsed.contact;

    const userUpdateData: any = {};
    if (parsed.nom !== undefined) userUpdateData.lastName = parsed.nom;
    if (parsed.prenom !== undefined) userUpdateData.firstName = parsed.prenom;
    if (parsed.contact !== undefined && parsed.contact) {
      if (parsed.contact.telephone !== undefined) userUpdateData.phone = parsed.contact.telephone;
      if (parsed.contact.email !== undefined) userUpdateData.email = parsed.contact.email;
    }
    if (parsed.phone !== undefined) userUpdateData.phone = parsed.phone;
    if (parsed.email !== undefined) userUpdateData.email = parsed.email;
    if (parsed.region !== undefined) userUpdateData.region = parsed.region;
    if (parsed.departement !== undefined) userUpdateData.departement = parsed.departement;
    if (parsed.commune !== undefined) userUpdateData.commune = parsed.commune;
    if (parsed.arrondissement !== undefined) userUpdateData.arrondissement = parsed.arrondissement;

    if (parsed.password) {
      const salt = await bcrypt.genSalt(10);
      userUpdateData.password = await bcrypt.hash(parsed.password, salt);
    }

    if (Object.keys(updateData).length === 0 && Object.keys(userUpdateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const agentRow = await db.transaction(async (tx) => {
      if (Object.keys(userUpdateData).length > 0) {
        await tx.update(users).set(userUpdateData).where(eq(users.id as any, userId as any));
      }

      const existing = await tx
        .select({ idAgent: agents.idAgent, matriculeSol: agents.matriculeSol })
        .from(agents)
        .where(eq(agents.userId as any, userId as any))
        .limit(1);

      if (existing?.[0]?.idAgent) {
        if (Object.keys(updateData).length > 0) {
          await tx.update(agents).set(updateData).where(eq(agents.idAgent, Number(existing[0].idAgent)));
        }
        return { idAgent: Number(existing[0].idAgent) };
      }

      const uRows = await tx
        .select({ username: users.username, matricule: users.matricule, firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id as any, userId as any))
        .limit(1);
      const u = uRows?.[0];
      if (!u) return null;

      const matriculeSol = String(updateData.matriculeSol || u.matricule || u.username || `U${userId}`).trim();
      const contact = updateData.contact !== undefined ? updateData.contact : { telephone: u.phone ?? null, email: u.email ?? null };

      const [created] = await tx
        .insert(agents)
        .values({
          userId,
          matriculeSol,
          nom: updateData.nom ?? (u.lastName ?? null),
          prenom: updateData.prenom ?? (u.firstName ?? null),
          grade: updateData.grade ?? null,
          genre: updateData.genre ?? null,
          roleMetierId: updateData.roleMetierId ?? null,
          contact: contact as any,
        } as any)
        .returning({ idAgent: agents.idAgent });

      if (!created?.idAgent) return null;
      return { idAgent: Number(created.idAgent) };
    });

    if (!agentRow?.idAgent) return res.status(404).json({ message: 'Non trouvé' });
    const joined = await getAgentJoinedRow(Number(agentRow.idAgent));
    return res.json(joined || agentRow);
  } catch (e: any) {
    console.error('Erreur upsertAgentByUser:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Conflit: valeur unique déjà existante.' });
    }
    return res.status(500).json({ message: e?.message || "Erreur lors de la mise à jour de l'agent" });
  }
}

export async function createAgent(req: Request, res: Response) {
  try {
    const parsed = createAgentSchema.parse(req.body);

    const userMatricule = parsed.userMatricule.trim();
    // Éviter de confondre matricule et numéro de téléphone (9 chiffres)
    if (/^\d{9}$/.test(userMatricule.replace(/\s+/g, ''))) {
      return res.status(400).json({ message: "Matricule invalide (ne doit pas être un numéro de téléphone)." });
    }
    const normalizedMatriculeSol = String(parsed.matriculeSol ?? userMatricule).trim();
    if (!normalizedMatriculeSol) {
      return res.status(400).json({ message: 'Matricule Solde requis' });
    }

    const normalizedEmail = parsed.email.trim().toLowerCase();
    const created = await db.transaction(async (tx) => {
      const existingUser = await findUserByMatriculeKey(tx, userMatricule);
      const existingAgentBySol = await findAgentByMatriculeSolKey(tx, normalizedMatriculeSol);
      const existingUserByEmail = await findUserByEmail(tx, normalizedEmail);

      if (existingUserByEmail && (!existingUser || existingUserByEmail.id !== existingUser.id)) {
        throw Object.assign(
          new Error(`L'email ${normalizedEmail} est déjà utilisé par un autre compte (id ${existingUserByEmail.id}).`),
          { statusCode: 409, code: 'EMAIL_TAKEN' }
        );
      }

      if (existingAgentBySol) {
        const agentUser = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id as any, existingAgentBySol.userId as any))
          .limit(1);
        if (agentUser?.[0]?.id) {
          throw Object.assign(
            new Error(
              `Un agent actif existe déjà avec ce matricule (${existingAgentBySol.matriculeSol}, id agent ${existingAgentBySol.idAgent}). Supprimez-le d'abord pour recréer.`
            ),
            { statusCode: 409, code: 'MATRICULE_SOL_TAKEN' }
          );
        }
        // Profil agent orphelin (utilisateur supprimé) : libérer le matricule
        await tx.delete(agents).where(eq(agents.idAgent, existingAgentBySol.idAgent));
      }

      let userId: number;

      if (existingUser) {
        const linkedAgent = await tx
          .select({ idAgent: agents.idAgent })
          .from(agents)
          .where(eq(agents.userId as any, existingUser.id as any))
          .limit(1);
        if (linkedAgent?.[0]?.idAgent) {
          throw Object.assign(
            new Error(
              `Ce matricule est déjà rattaché à un agent actif (id agent ${linkedAgent[0].idAgent}). Supprimez l'agent existant pour en créer un nouveau.`
            ),
            { statusCode: 409, code: 'MATRICULE_USER_LINKED' }
          );
        }

        // Compte utilisateur orphelin (suppression agent seule) : réutiliser le compte
        await tx
          .update(users)
          .set({
            email: normalizedEmail,
            firstName: (parsed.firstName ?? parsed.prenom ?? null) as any,
            lastName: (parsed.lastName ?? parsed.nom ?? null) as any,
            phone: (parsed.phone ?? null) as any,
            matricule: userMatricule as any,
            role: 'agent' as any,
            region: (parsed.region ?? null) as any,
            departement: (parsed.departement ?? null) as any,
            commune: (parsed.commune ?? null) as any,
            arrondissement: (parsed.arrondissement ?? null) as any,
          } as any)
          .where(eq(users.id as any, existingUser.id as any));

        userId = existingUser.id;
      } else {
        const defaultPassword = "0000";
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);

        const [createdUser] = await tx
          .insert(users)
          .values({
            username: userMatricule,
            password: hashedPassword,
            email: normalizedEmail,
            firstName: (parsed.firstName ?? parsed.prenom ?? null) as any,
            lastName: (parsed.lastName ?? parsed.nom ?? null) as any,
            phone: (parsed.phone ?? null) as any,
            matricule: userMatricule as any,
            role: 'agent' as any,
            isActive: false as any,
            active: false as any,
            region: (parsed.region ?? null) as any,
            departement: (parsed.departement ?? null) as any,
            commune: (parsed.commune ?? null) as any,
            arrondissement: (parsed.arrondissement ?? null) as any,
          } as any)
          .returning({ id: users.id });

        if (!createdUser?.id) {
          throw Object.assign(new Error("Erreur lors de la création de l'utilisateur"), { statusCode: 500 });
        }
        userId = createdUser.id;
      }

      const [createdAgent] = await tx
        .insert(agents)
        .values({
          userId,
          matriculeSol: normalizedMatriculeSol,
          nom: parsed.nom ?? null,
          prenom: parsed.prenom ?? null,
          grade: parsed.grade ?? null,
          genre: parsed.genre ?? null,
          roleMetierId: parsed.roleMetierId ?? null,
          contact: parsed.contact ?? null,
        } as any)
        .onConflictDoUpdate({
          target: agents.userId as any,
          set: {
            matriculeSol: normalizedMatriculeSol,
            nom: parsed.nom ?? null,
            prenom: parsed.prenom ?? null,
            grade: parsed.grade ?? null,
            genre: parsed.genre ?? null,
            roleMetierId: parsed.roleMetierId ?? null,
            contact: parsed.contact ?? null,
          } as any,
        })
        .returning({ idAgent: agents.idAgent });

      if (!createdAgent?.idAgent) {
        throw Object.assign(new Error("Erreur lors de la création de l'agent"), { statusCode: 500 });
      }

      return createdAgent;
    });

    const joined = await getAgentJoinedRow(Number(created.idAgent));
    return res.status(201).json(joined || created);
  } catch (e: any) {
    console.error('Erreur createAgent:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (typeof e?.statusCode === 'number') {
      return res.status(e.statusCode).json({ message: e?.message || 'Erreur' });
    }
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      const detail = String(e?.detail || e?.message || '');
      let hint = 'Conflit: une valeur unique existe déjà (matricule, email ou username).';
      if (detail.includes('matricule')) hint = 'Ce matricule existe déjà dans la base (format différent possible : espaces, casse).';
      if (detail.includes('email')) hint = 'Cet email est déjà utilisé par un autre compte.';
      if (detail.includes('matricule_sol')) hint = 'Ce matricule solde est déjà utilisé par un autre agent.';
      return res.status(409).json({ message: hint, detail });
    }
    return res.status(500).json({ message: e?.message || "Erreur lors de la création de l'agent" });
  }
}

export async function updateAgent(req: Request, res: Response) {
  try {
    const idAgent = Number(req.params.idAgent);
    if (!idAgent || !Number.isFinite(idAgent)) return res.status(400).json({ message: 'ID agent invalide' });

    const parsed = updateAgentSchema.parse(req.body);
    const updateData: any = {};

    if (parsed.matriculeSol !== undefined) updateData.matriculeSol = parsed.matriculeSol;
    if (parsed.nom !== undefined) updateData.nom = parsed.nom;
    if (parsed.prenom !== undefined) updateData.prenom = parsed.prenom;
    if (parsed.grade !== undefined) updateData.grade = parsed.grade;
    if (parsed.genre !== undefined) updateData.genre = parsed.genre;
    if (parsed.roleMetierId !== undefined) updateData.roleMetierId = parsed.roleMetierId;
    if (parsed.contact !== undefined) updateData.contact = parsed.contact;

    const userUpdateData: any = {};
    if (parsed.nom !== undefined) userUpdateData.lastName = parsed.nom;
    if (parsed.prenom !== undefined) userUpdateData.firstName = parsed.prenom;
    if (parsed.contact !== undefined && parsed.contact) {
      if (parsed.contact.telephone !== undefined) userUpdateData.phone = parsed.contact.telephone;
      if (parsed.contact.email !== undefined) userUpdateData.email = parsed.contact.email;
    }
    if (parsed.phone !== undefined) userUpdateData.phone = parsed.phone;
    if (parsed.email !== undefined) userUpdateData.email = parsed.email;
    if (parsed.region !== undefined) userUpdateData.region = parsed.region;
    if (parsed.departement !== undefined) userUpdateData.departement = parsed.departement;
    if (parsed.commune !== undefined) userUpdateData.commune = parsed.commune;
    if (parsed.arrondissement !== undefined) userUpdateData.arrondissement = parsed.arrondissement;

    if (parsed.password) {
      const salt = await bcrypt.genSalt(10);
      userUpdateData.password = await bcrypt.hash(parsed.password, salt);
    }

    if (Object.keys(updateData).length === 0 && Object.keys(userUpdateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const updated = await db.transaction(async (tx) => {
      let agentRow: { idAgent: number; userId: number } | null = null;

      if (Object.keys(updateData).length > 0) {
        const rows = await tx
          .update(agents)
          .set(updateData)
          .where(eq(agents.idAgent, idAgent))
          .returning({ idAgent: agents.idAgent, userId: agents.userId });
        agentRow = (rows?.[0] as any) || null;
      } else {
        const rows = await tx
          .select({ idAgent: agents.idAgent, userId: agents.userId })
          .from(agents)
          .where(eq(agents.idAgent, idAgent))
          .limit(1);
        agentRow = (rows?.[0] as any) || null;
      }

      if (!agentRow) return null;

      if (Object.keys(userUpdateData).length > 0) {
        await tx.update(users).set(userUpdateData).where(eq(users.id as any, agentRow.userId as any));
      }

      return agentRow;
    });

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });

    const joined = await getAgentJoinedRow(idAgent);
    return res.json(joined || updated);
  } catch (e: any) {
    console.error('Erreur updateAgent:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Conflit: valeur unique déjà existante.' });
    }
    return res.status(500).json({ message: e?.message || "Erreur lors de la mise à jour de l'agent" });
  }
}
