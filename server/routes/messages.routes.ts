// @ts-nocheck
import { and, eq, inArray } from 'drizzle-orm';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { agents, rolesMetier, superAdmins, userDomains, users } from '../../shared/schema.js';
import { db } from '../db.js';
import { MessagingService } from '../services/messaging.service.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRootDir = path.resolve(__dirname, '..', '..');
const uploadsDir = path.resolve(projectRootDir, 'uploads');

const resolveAttachmentFilePath = (attachmentPath: string): string => {
  if (!attachmentPath) return attachmentPath;
  if (path.isAbsolute(attachmentPath)) return attachmentPath;

  const candidateFromProjectRoot = path.resolve(uploadsDir, attachmentPath);
  if (fs.existsSync(candidateFromProjectRoot)) return candidateFromProjectRoot;

  const candidateFromCwd = path.resolve(process.cwd(), 'uploads', attachmentPath);
  return candidateFromCwd;
};



// Configuration de Multer pour les pièces jointes avec encodage UTF-8
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
      } catch {}
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      // Encoder correctement le nom de fichier en UTF-8
      // Décoder d'abord si nécessaire, puis générer un nom sûr
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeExtension = path.extname(originalName);
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const safeName = `${timestamp}-${randomSuffix}${safeExtension}`;
      cb(null, safeName);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // S'assurer que le nom original est bien encodé en UTF-8
    try {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      cb(null, true);
    } catch (error) {
      console.error('Erreur d\'encodage du nom de fichier:', error);
      cb(null, true); // Accepter quand même le fichier
    }
  }
});

// Lister des agents par rôle (ex: role=sector). Optionnel: filtrer par région/département de l'utilisateur connecté
router.get('/agents', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const roleParam = String(req.query.role || '').trim().toLowerCase();
    if (!roleParam) return res.status(400).json({ message: 'Paramètre role requis' });

    const current = (req as any)?.user || {};
    const currentUserId = Number(current?.id);
    if (!currentUserId) return res.status(401).json({ message: 'Non authentifié' });

    // isDefaultRole/isSupervisorRole are NOT columns in users table;
    // they come from agents.roleMetierId -> rolesMetier.isDefault/isSupervisor
    const [currentUserRow] = await db
      .select({
        id: users.id,
        role: users.role,
        region: users.region,
        departement: users.departement,
        roleMetierIsDefault: (rolesMetier as any).isDefault,
        roleMetierIsSupervisor: (rolesMetier as any).isSupervisor,
      })
      .from(users)
      .leftJoin(agents, eq(agents.userId as any, users.id as any))
      .leftJoin(rolesMetier, eq(rolesMetier.id as any, agents.roleMetierId as any))
      .where(eq(users.id as any, currentUserId as any))
      .limit(1);

    const resolvedCurrent = currentUserRow || current;
    const isDefaultRoleUser = !!(resolvedCurrent as any)?.roleMetierIsDefault;
    const isSupervisorRoleUser = !!(resolvedCurrent as any)?.roleMetierIsSupervisor;

    const rawDomaineId = (req.query as any)?.domaineId;
    const sanitizedDomaineId = (!rawDomaineId || rawDomaineId === 'undefined' || rawDomaineId === 'null')
      ? undefined
      : rawDomaineId;
    const domaineId = isDefaultRoleUser
      ? null
      : await MessagingService.getAuthorizedContext(currentUserId, sanitizedDomaineId, res);
    if (domaineId === false) return;

    // Contexte utilisateur courant pour filtrer par région/département
    const explicitRegion = (req.query.region as string) !== undefined ? String(req.query.region).trim() : '';
    const region = explicitRegion
      ? explicitRegion
      : (String(resolvedCurrent?.role || '').toLowerCase() === 'admin' ? null : (resolvedCurrent?.region || null));
    const departementFilter = (req.query.departement as string)?.trim() || null;

    const isSectorLikeRole = (r: string) => {
      const rr = String(r || '').toLowerCase();
      return rr === 'sector' || rr === 'sub-agent' || rr.includes('sector');
    };

    const whereRole = roleParam === 'sector'
      ? inArray(users.role as any, ['sub-agent'] as any)
      : eq(users.role as any, roleParam as any);

    const domainUsers = isDefaultRoleUser
      ? await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            matricule: users.matricule,
            firstName: users.firstName,
            lastName: users.lastName,
            region: users.region,
            departement: users.departement,
            role: users.role,
            grade: agents.grade,
          })
          .from(users)
          .leftJoin(agents, eq(agents.userId as any, users.id as any))
          .where(and(whereRole as any, eq(users.isActive as any, true as any)) as any)
      : await db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            matricule: users.matricule,
            firstName: users.firstName,
            lastName: users.lastName,
            region: users.region,
            departement: users.departement,
            role: users.role,
            grade: agents.grade,
          })
          .from(users)
          .innerJoin(userDomains, and(eq(userDomains.userId, users.id), eq(userDomains.active as any, true as any), eq(userDomains.domaineId as any, domaineId as any)))
          .leftJoin(agents, eq(agents.userId as any, users.id as any))
          .where(and(whereRole as any, eq(users.isActive as any, true as any)) as any);

    const systemAdminUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        matricule: users.matricule,
        firstName: users.firstName,
        lastName: users.lastName,
        region: users.region,
        departement: users.departement,
        role: users.role,
        grade: agents.grade,
      })
      .from(superAdmins)
      .innerJoin(users, eq(users.id as any, superAdmins.userId as any))
      .leftJoin(agents, eq(agents.userId as any, users.id as any));

    const superAdminIds = new Set((systemAdminUsers || []).map((u: any) => Number(u.id)).filter((n: any) => Number.isFinite(n)));

    const norm = (s: any) => String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const filtered = (Array.isArray(domainUsers) ? domainUsers : [])
      .filter((u: any) => {
        const r = String(u?.role || '').toLowerCase();
        const roleOk = roleParam === 'sector'
          ? isSectorLikeRole(r)
          : r === roleParam;
        if (!roleOk) return false;
        if (region && u?.region && norm(u.region) !== norm(region)) return false;
        if (departementFilter && u?.departement && norm(u.departement) !== norm(departementFilter)) return false;
        return true;
      })
      .filter((u: any) => {
        if (roleParam !== 'admin') return true;
        // Admin: inclure uniquement l'admin du domaine (dans ce domaine) - pas les admins d'autres domaines.
        return !superAdminIds.has(Number(u.id));
      });

    const mergedForAdmin = roleParam === 'admin'
      ? [...filtered, ...(Array.isArray(systemAdminUsers) ? systemAdminUsers : [])]
      : filtered;

    const payload = mergedForAdmin.map((u: any) => ({
      id: u.id,
      username: u.username ?? null,
      email: u.email ?? null,
      matricule: u.matricule ?? null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      grade: u.grade ?? null,
      label: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || (u.username ?? `#${u.id}`),
      region: u.region ?? null,
      departement: u.departement ?? null,
      role: u.role ?? null,
    }));
    res.json(payload);
  } catch (error) {
    console.error('Erreur lors de la liste des agents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Transférer un message individuel vers des agents de secteur
router.post('/:id/forward', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const parentId = Number(req.params.id);
    const user = (req as any)?.user;
    const senderId = user?.id;
    const role = user?.role;
    if (!senderId) return res.status(401).json({ message: 'Non authentifié' });

    // Autoriser uniquement certains rôles (ex: agent régional)
    const allowedRoles = new Set(['agent', 'regional', 'chef-regional']);
    if (role && !allowedRoles.has(String(role))) {
      return res.status(403).json({ message: 'Transfert non autorisé pour ce rôle' });
    }

    const parent = await storage.getMessage(parentId);
    if (!parent) return res.status(404).json({ message: 'Message à transférer introuvable' });
    if (parent.senderId !== senderId && parent.recipientId !== senderId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const subject = (req.body?.subject ?? parent.subject) as string | undefined;
    const content = (req.body?.content ?? parent.content) as string;
    const recipientIdsValue = (req.body as any)?.recipientIds;
    const recipientIdentifiersValue = (req.body as any)?.recipientIdentifiers;
    const recipientIds: number[] = Array.isArray(recipientIdsValue)
      ? recipientIdsValue.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
      : typeof recipientIdsValue === 'string'
        ? (() => { try { const arr = JSON.parse(recipientIdsValue); return Array.isArray(arr) ? arr.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0) : []; } catch { return []; } })()
        : [];
    // Identifiants libres: emails / téléphones / usernames / matricules / N° chasseur
    const identifiers: string[] = Array.isArray(recipientIdentifiersValue)
      ? (recipientIdentifiersValue as any[]).map((s) => String(s)).filter((s) => s && s.trim())
      : typeof recipientIdentifiersValue === 'string'
        ? String(recipientIdentifiersValue).split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    // Résoudre les identifiants vers IDs utilisateurs
    const resolvedIds: number[] = [];
    for (const ident of identifiers) {
      try {
        const u = await storage.findUserByIdentifier(ident);
        if (u?.id && Number.isFinite(Number(u.id))) {
          resolvedIds.push(Number(u.id));
        }
      } catch (e) {
        console.warn('[POST /messages/:id/forward] failed to resolve identifier', ident, e);
      }
    }

    const combinedCandidateIds = Array.from(new Set([...(recipientIds || []), ...resolvedIds]));
    if (!combinedCandidateIds.length) return res.status(400).json({ message: 'Aucun destinataire fourni (IDs ou identifiants)' });

    // Restreindre aux agents secteur/sub-agent de la même région que l'expéditeur
    const currentRegion = user?.region || null;
    const recipientUsers = await storage.getUsersByIds(combinedCandidateIds as number[]);
    const allowedRecipients = (Array.isArray(recipientUsers) ? recipientUsers : []).filter((u: any) => {
      const role = String(u?.role || '').toLowerCase();
      const sameRegion = !currentRegion || !u?.region ? true : String(u.region).trim().toLowerCase() === String(currentRegion).trim().toLowerCase();
      // Autoriser tout utilisateur résolu par identifiant (guides/hunters/users) mais exiger la même région si info disponible
      // Pour les sélections via la liste secteur, on avait déjà filtré côté /agents; ici on ne force pas le rôle, seulement la région
      return sameRegion;
    }).map((u: any) => u.id);

    if (allowedRecipients.length === 0) {
      return res.status(400).json({ message: "Aucun destinataire autorisé (même région et rôle secteur/sub-agent requis)" });
    }

    const created: any[] = [];
    for (const rid of allowedRecipients) {
      const child = await storage.createMessage({
        senderId,
        recipientId: rid,
        subject,
        content,
        parentMessageId: parent.id,
        // Propager les pièces jointes si souhaité
        attachmentSize: parent.attachmentSize ?? undefined,
        domaineId: req.body.domaineId || parent.domaineId || null,
      } as any);
      created.push(child);
    }
    res.status(201).json({ forwarded: created.length, items: created });
  } catch (error) {
    console.error('Erreur lors du transfert de message:', error);
    res.status(500).json({ message: 'Échec du transfert' });
  }
});

// Récupérer les messages reçus
router.get('/inbox', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const domaineId = await MessagingService.getAuthorizedContext(userId, req.query.domaineId, res);
    if (domaineId === false) return;

    const userMessages = await storage.getMessagesByRecipient(userId, domaineId ?? undefined);
    res.json(userMessages);
  } catch (error) {
    console.error("Erreur lors de la récupération des messages:", error);
    res.status(500).json({ message: "Échec de la récupération des messages" });
  }
});

// Récupérer les messages envoyés
router.get('/sent', isAuthenticated, async (req, res) => {
  try {
    const senderId = (req as any)?.user?.id || 0;
    const domaineId = await MessagingService.getAuthorizedContext(senderId, req.query.domaineId, res);
    if (domaineId === false) return;

    const [individual, group] = await Promise.all([
      storage.getMessagesBySender(senderId, domaineId ?? undefined),
      storage.getGroupMessagesBySender(senderId, domaineId ?? undefined),
    ]);

    // Enrichir les individuels avec info destinataire
    const recipientIds = (Array.isArray(individual) ? individual : []).map((m: any) => m.recipientId).filter((v: any) => Number.isFinite(v));
    const recipientUsers = await storage.getUsersByIds(recipientIds as number[]);
    const recipientMap = new Map(recipientUsers.map((u: any) => [u.id, u]));

    // Agréger aussi les lecteurs des messages transférés (enfants via parentMessageId)
    const enrichedIndividual = await Promise.all((Array.isArray(individual) ? individual : []).map(async (m: any) => {
      const readers: any[] = [];
      const user = recipientMap.get(m.recipientId);
      if (m.isRead && user) {
        readers.push({
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          matricule: user.matricule ?? null,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || (user.username ?? `#${user.id}`),
          role: user.role ?? null,
          region: user.region ?? null,
          departement: user.departement ?? null,
          readAt: m.readAt ?? null,
        });
      }
      // enfants transférés
      try {
        const children = await storage.getMessagesByParent(m.id);
        const childRecipientIds = (children || []).map((c: any) => c.recipientId).filter((v: any) => Number.isFinite(v));
        const childRecipients = await storage.getUsersByIds(childRecipientIds as number[]);
        const childMap = new Map(childRecipients.map((u: any) => [u.id, u]));
        for (const c of (children || [])) {
          if (c.isRead) {
            const cu = childMap.get(c.recipientId);
            readers.push({
              firstName: cu?.firstName ?? null,
              lastName: cu?.lastName ?? null,
              matricule: cu?.matricule ?? null,
              name: cu ? ([cu.firstName, cu.lastName].filter(Boolean).join(' ').trim() || (cu.username ?? `#${cu.id}`)) : `Utilisateur #${c.recipientId}`,
              role: cu?.role ?? null,
              region: cu?.region ?? null,
              departement: cu?.departement ?? null,
              readAt: c.readAt ?? null,
            });
          }
        }
      } catch {}
      return {
        ...m,
        isGroupMessage: false,
        readers,
        readStatus: readers.length > 0 ? 'read' : 'unread',
      };
    }));

    // Enrichir les groupes avec les lecteurs réels
    const normalizedGroup = Array.isArray(group)
      ? await Promise.all(group.map(async (message: any) => {
          const reads = await storage.getGroupReadsWithUsers(message.id);
          const readers = (Array.isArray(reads) ? reads : [])
            .filter((r: any) => r && r.isRead && !r.isDeleted)
            .map((r: any) => ({
              firstName: r.firstName ?? null,
              lastName: r.lastName ?? null,
              matricule: r.matricule ?? null,
              name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || `Utilisateur #${r.userId}`,
              role: r.role ?? null,
              region: r.region ?? null,
              departement: r.departement ?? null,
              readAt: r.readAt ?? null,
            }));
          return {
            ...message,
            isGroupMessage: true,
            recipientId: undefined,
            recipientName: undefined,
            targetRole: message.targetRole,
            targetRegion: message.targetRegion,
            attachmentPath: message.attachmentPath ?? undefined,
            attachmentName: message.attachmentName ?? undefined,
            attachmentMime: message.attachmentMime ?? undefined,
            attachmentSize: message.attachmentSize ?? undefined,
            readers,
            readStatus: readers.length > 0 ? 'read' : 'unread',
          };
        }))
      : [];

    const combined = [...enrichedIndividual, ...normalizedGroup];

    console.log('[GET /api/messages/sent] userId=%s individual=%d group=%d combined=%d', senderId, Array.isArray(individual) ? individual.length : 0, normalizedGroup.length, combined.length);
    res.json(combined);
  } catch (error) {
    console.error("Erreur lors de la récupération des messages envoyés:", error);
    res.status(500).json({ message: "Échec de la récupération des messages envoyés" });
  }
});

// Envoyer un message individuel avec pièce jointe
router.post('/', isAuthenticated, upload.single('attachment'), async (req: Request, res: Response) => {
  try {
    const senderId = (req as any)?.user?.id;
    if (!senderId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const subject = req.body?.subject ?? undefined;
    const content = req.body?.content ?? req.body?.body ?? req.body?.message;
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) {
      return res.status(400).json({ message: 'Le contenu du message est requis.' });
    }

    const recipientIdentifier = (req.body as any)?.recipient ?? (req.body as any)?.recipientIdentifier;
    const recipientIdsValue = (req.body as any)?.recipientIds;
    const fallbackRecipientId = (req.body as any)?.recipientId;

    const recipientIds: number[] = [];

    if (recipientIdentifier && typeof recipientIdentifier === 'string') {
      const tokens = String(recipientIdentifier)
        .split(/[;\n,]+/g)
        .map((s) => s.trim())
        .filter(Boolean);

      const unresolved: string[] = [];
      for (const token of tokens) {
        try {
          const resolved = await storage.findUserByIdentifier(token);
          if (resolved?.id) {
            recipientIds.push(Number(resolved.id));
          } else {
            unresolved.push(token);
          }
        } catch (e) {
          console.warn('[POST /api/messages] failed to resolve identifier', token, e);
          unresolved.push(token);
        }
      }

      // Dédupliquer
      const unique = Array.from(new Set(recipientIds.filter((n) => Number.isFinite(n) && n > 0)));
      recipientIds.length = 0;
      recipientIds.push(...unique);

      if (!recipientIds.length) {
        return res.status(404).json({ message: "Destinataire introuvable" });
      }
    }

    if (recipientIds.length === 0) {
      if (Array.isArray(recipientIdsValue)) {
        for (const value of recipientIdsValue) {
          const numeric = Number(value);
          if (Number.isFinite(numeric) && numeric > 0) {
            recipientIds.push(numeric);
          }
        }
      } else if (typeof recipientIdsValue === 'string') {
        try {
          const parsed = JSON.parse(recipientIdsValue);
          if (Array.isArray(parsed)) {
            for (const value of parsed) {
              const numeric = Number(value);
              if (Number.isFinite(numeric) && numeric > 0) {
                recipientIds.push(numeric);
              }
            }
          }
        } catch (err) {
          console.warn('[POST /api/messages] JSON parse failure for recipientIds:', err);
        }
      }
    }

    if (recipientIds.length === 0 && fallbackRecipientId !== undefined) {
      const numericId = Number(fallbackRecipientId);
      if (Number.isFinite(numericId) && numericId > 0) {
        recipientIds.push(numericId);
      }
    }

    if (!recipientIds.length) {
      return res.status(400).json({ message: 'Aucun destinataire valide fourni.' });
    }

    const domaineId = await MessagingService.getAuthorizedContext(senderId, req.body.domaineId, res);
    if (domaineId === false) return;

    const createdMessages = [] as any[];
    const basePayload = {
      senderId,
      subject,
      content: normalizedContent,
      attachmentPath: req.file ? req.file.filename : undefined,
      attachmentName: req.file ? req.file.originalname : undefined,
      attachmentMime: req.file ? req.file.mimetype : undefined,
      attachmentSize: req.file ? req.file.size : undefined,
    };

    for (const recipientId of recipientIds) {
      try {
        const newMessage = await storage.createMessage({
          senderId,
          recipientId,
          subject,
          content: normalizedContent,
          attachmentPath: basePayload.attachmentPath,
          attachmentName: basePayload.attachmentName,
          attachmentMime: basePayload.attachmentMime,
          attachmentSize: basePayload.attachmentSize,
          domaineId: domaineId ?? null,
        });
        createdMessages.push({ ...newMessage, isGroupMessage: false });
      } catch (innerErr) {
        console.error('[POST /api/messages] createMessage failed for recipient', recipientId, innerErr);
        const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        return res.status(400).json({ message: "Échec de l'envoi du message", error: errMsg });
      }
    }

    res.status(201).json(createdMessages);
  } catch (error) {
    console.error("Erreur lors de l'envoi du message:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ message: "Échec de l'envoi du message", error: errMsg });
  }
});

// Envoyer un message de groupe
router.post('/group', isAuthenticated, upload.single('attachment'), async (req, res) => {
  try {
    const { subject, content, targetRole, targetRegion } = req.body;
    const senderId = (req as any)?.user?.id;

    if (!senderId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    // Garde-fou: contenu requis, type par défaut, et rôle cible requis
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const normalizedTargetRole = typeof targetRole === 'string' ? targetRole.trim() : '';
    if (!normalizedContent) {
      return res.status(400).json({ message: 'Le contenu du message est requis.' });
    }
    if (!normalizedTargetRole) {
      return res.status(400).json({ message: 'Le rôle cible (targetRole) est requis pour un message de groupe.' });
    }

    const domaineId = await MessagingService.getAuthorizedContext(senderId, req.body.domaineId, res);
    if (domaineId === false) return;

    // Créer le message de groupe
    const groupMessage = await storage.createGroupMessage({
      senderId,
      subject,
      content: normalizedContent,
      targetRole: normalizedTargetRole,
      targetRegion,
      attachmentPath: req.file ? req.file.filename : undefined,
      attachmentName: req.file ? req.file.originalname : undefined,
      attachmentMime: req.file ? req.file.mimetype : undefined,
      attachmentSize: req.file ? req.file.size : undefined,
      domaineId: domaineId ?? null,
    });

    res.status(201).json(groupMessage);
  } catch (error) {
    console.error("Erreur lors de l'envoi du message de groupe:", error);
    res.status(400).json({ message: "Échec de l'envoi du message de groupe" });
  }
});

// Récupérer les messages de groupe pour l'utilisateur
router.get('/group/inbox', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const domaineId = await MessagingService.getAuthorizedContext(userId, req.query.domaineId, res);
    if (domaineId === false) return;

    const groupMessages = await storage.getGroupMessagesByUser(userId, domaineId ?? undefined);
    res.json(groupMessages);
  } catch (error) {
    console.error('Erreur récupération messages de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer un message comme lu
router.patch('/:id/read', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const message = await storage.getMessage(messageId);
    if (!message || message.recipientId !== userId) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    const updatedMessage = await storage.markMessageAsRead(messageId);
    res.json(updatedMessage);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du message:", error);
    res.status(500).json({ message: "Échec de la mise à jour du message" });
  }
});

// Supprimer un message
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    if (!Number.isFinite(messageId) || messageId <= 0) {
      return res.status(400).json({ message: 'Identifiant de message invalide' });
    }

    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message non trouvé" });
    }

    if (message.senderId === userId) {
      await storage.markMessageDeletedBySender(messageId, userId);
    } else if (message.recipientId === userId) {
      await storage.markMessageDeletedForRecipient(messageId, userId);
    } else {
      return res.status(403).json({ message: "Accès refusé" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Erreur lors de la suppression du message:", error);
    const anyErr: any = error as any;
    res.status(500).json({
      message: "Échec de la suppression du message",
      error: anyErr?.message || String(error),
      code: anyErr?.code,
    });
  }
});


// =======================
// API GROUP MESSAGES
// =======================

// Marquer un message de groupe comme lu
router.patch('/group/:id/read', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    const messageId = Number(req.params.id);
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const result = await storage.markGroupMessageAsRead(messageId, userId);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut lu du message de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer un message de groupe comme supprimé pour l'utilisateur
router.patch('/group/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    const messageId = Number(req.params.id);
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const result = await storage.markGroupMessageAsDeleted(messageId, userId);
    res.json(result);
  } catch (error) {
    console.error('Erreur lors de la suppression du message de groupe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const domaineId = await MessagingService.getAuthorizedContext(userId, req.query.domaineId, res);
    if (domaineId === false) return;

    // null domaineId = no domain (default/supervisor agents) — don't filter by domain
    const counts = await storage.countUnreadMessages(userId, domaineId ?? undefined);
    res.json({ ...counts, total: counts.individual + counts.group });
  } catch (error) {
    console.error('Erreur lors du comptage des messages non lus:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Télécharger/Afficher une pièce jointe d'un message individuel
router.get('/:id/attachment', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    // Vérifier que l'utilisateur a accès au message
    if (message.senderId !== userId && message.recipientId !== userId) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    if (!message.attachmentPath) {
      return res.status(404).json({ message: 'Aucune pièce jointe' });
    }

    const filePath = resolveAttachmentFilePath(message.attachmentPath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    // Préparer les en-têtes: inline par défaut pour permettre l'aperçu, attachment si ?download=1
    const mime = message.attachmentMime || 'application/octet-stream';
    const fileName = message.attachmentName || 'fichier';
    const forceDownload = String(req.query.download || '').trim() === '1';

    res.setHeader('Content-Type', mime);
    if (forceDownload) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    }
    if (message.attachmentSize) {
      res.setHeader('Content-Length', String(message.attachmentSize));
    }

    // Envoyer le fichier en mode binaire
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Erreur lors du téléchargement de la pièce jointe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Télécharger/Afficher une pièce jointe d'un message de groupe
router.get('/group/:id/attachment', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const messageId = Number(req.params.id);
    const userId = (req as any)?.user?.id;

    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const groupMessage = await storage.getGroupMessage(messageId);
    if (!groupMessage) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }

    if (!groupMessage.attachmentPath) {
      return res.status(404).json({ message: 'Aucune pièce jointe' });
    }

    const filePath = resolveAttachmentFilePath(groupMessage.attachmentPath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Fichier non trouvé' });
    }

    // Préparer les en-têtes: inline par défaut pour permettre l'aperçu, attachment si ?download=1
    const mime = groupMessage.attachmentMime || 'application/octet-stream';
    const fileName = groupMessage.attachmentName || 'fichier';
    const forceDownload = String(req.query.download || '').trim() === '1';

    res.setHeader('Content-Type', mime);
    if (forceDownload) {
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    }
    if (groupMessage.attachmentSize) {
      res.setHeader('Content-Length', String(groupMessage.attachmentSize));
    }

    // Envoyer le fichier en mode binaire
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Erreur lors du téléchargement de la pièce jointe:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

export default router;
