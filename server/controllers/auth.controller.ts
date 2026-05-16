import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { agents, rolesMetier, users } from '../../shared/schema.js';
import { db } from '../db.js';
import { storage } from '../storage.js';

// Schéma de validation pour l'inscription
const registerSchema = z.object({
    username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
    email: z.string().email("Email invalide"),
    password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
    firstName: z.string().min(2, "Le prénom doit contenir au moins 2 caractères").optional(),
    lastName: z.string().min(2, "Le nom de famille doit contenir au moins 2 caractères").optional(),
    role: z.enum(["admin", "hunter", "agent", "sub-agent", "hunting-guide"]).optional()
});

export const login = async (req: Request, res: Response) => {
    try {
        const { identifier, password } = req.body;
        console.log('[LOGIN] Tentative de connexion pour:', identifier);

        const idValue = String(identifier || '').trim();
        if (!idValue) {
            return res.status(400).json({ message: "Identifiant requis" });
        }

        console.log('[LOGIN] Recherche par identifiant (email/username/matricule):', idValue);
        let user = await storage.findUserByIdentifier(idValue);

        if (!user) {
            console.log('[LOGIN] Utilisateur non trouvé:', idValue);
            // Historique : tentative de connexion avec identifiant inconnu
            try {
                await storage.createHistory({
                    userId: null,
                    operation: 'login_failed',
                    entityType: 'auth',
                    entityId: 0,
                    details: `Tentative de connexion échouée : identifiant "${idValue}" non trouvé`,
                });
            } catch {}
            return res.status(401).json({ message: "Identifiants invalides" });
        } else {
            console.log('[LOGIN] Utilisateur trouvé:', user.username);
        }

        // Vérifier si l'utilisateur a un rôle métier par défaut ou superviseur
        // → connexion par matricule seul (sans mot de passe)
        let skipPassword = false;
        let userRoleMetierCode: string | null = null;
        let userRoleMetierLabel: string | null = null;
        let isSupervisorRole = false;
        let isDefaultRole = false;

        try {
            const agentRows = await db
                .select({
                    roleMetierId: agents.roleMetierId,
                    roleMetierCode: rolesMetier.code,
                    roleMetierLabel: rolesMetier.labelFr,
                    roleMetierIsDefault: rolesMetier.isDefault,
                    roleMetierIsSupervisor: rolesMetier.isSupervisor,
                })
                .from(agents)
                .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
                .where(eq(agents.userId as any, (user as any).id as any))
                .limit(1);

            if (agentRows.length > 0 && agentRows[0].roleMetierId) {
                userRoleMetierCode = agentRows[0].roleMetierCode ?? null;
                userRoleMetierLabel = agentRows[0].roleMetierLabel ?? null;
                isDefaultRole = agentRows[0].roleMetierIsDefault ?? false;
                isSupervisorRole = agentRows[0].roleMetierIsSupervisor ?? false;

                // Si le mot de passe est vide/absent et que l'utilisateur a un rôle par défaut ou superviseur
                const passwordEmpty = !password || String(password).trim() === '';
                if (passwordEmpty && (isDefaultRole || isSupervisorRole)) {
                    skipPassword = true;
                    console.log('[LOGIN] Connexion sans mot de passe autorisée pour:', user.username, '(rôle métier:', userRoleMetierCode, ')');
                }
            }
        } catch (err) {
            console.warn('[LOGIN] Erreur vérification rôle métier:', err);
        }

        // Détection si le mot de passe stocké est un hash bcrypt
        const isBcryptHash = (value: string | null | undefined): boolean => {
            if (!value) return false;
            return (/^\$2[aby]\$/.test(value) && value.length >= 59 && value.length <= 64);
        };

        if (!skipPassword) {
            let passwordOk = false;
            if (isBcryptHash(user.password)) {
                // Comparaison sécurisée via bcrypt
                passwordOk = await bcrypt.compare(password, user.password as string);
                if (!passwordOk) {
                    console.log('[LOGIN] Mot de passe (bcrypt) incorrect pour:', user.username);
                    try {
                        await storage.createHistory({ userId: user.id, operation: 'login_failed', entityType: 'auth', entityId: user.id, details: `Mot de passe incorrect pour ${user.username}` });
                    } catch {}
                    return res.status(401).json({ message: "Identifiants invalides" });
                }
            } else {
                // Ancien mot de passe en clair: comparer en clair puis migrer vers hash si OK
                if (password !== user.password) {
                    console.log('[LOGIN] Mot de passe (plain) incorrect pour:', user.username);
                    try {
                        await storage.createHistory({ userId: user.id, operation: 'login_failed', entityType: 'auth', entityId: user.id, details: `Mot de passe incorrect pour ${user.username}` });
                    } catch {}
                    return res.status(401).json({ message: "Identifiants invalides" });
                }
                // Migration vers bcrypt
                try {
                    const salt = await bcrypt.genSalt(10);
                    const newHash = await bcrypt.hash(password, salt);
                    await storage.updateUser(user.id, { password: newHash } as any);
                    console.log('[LOGIN] Mot de passe migré vers bcrypt pour:', user.username);
                } catch (mErr) {
                    console.error('[LOGIN] Erreur de migration du mot de passe pour', user.username, mErr);
                    // Ne pas bloquer la connexion si la migration échoue; l’utilisateur s’est authentifié
                }
            }
        }

        if ((user as any).active === false || (user as any).isActive === false) {
            // Les agents avec rôle par défaut ou superviseur peuvent se connecter même si le compte est inactif
            if (!skipPassword) {
                return res.status(401).json({ message: "Identifiants invalides" });
            }
        }

        const isSuperAdmin = await storage.isSuperAdmin(user.id);

        const domainHeaderRaw = (req.headers as any)['x-domain'];
        let currentDomain = '';
        if (Array.isArray(domainHeaderRaw)) currentDomain = String(domainHeaderRaw[0] || '');
        else if (typeof domainHeaderRaw === 'string') currentDomain = domainHeaderRaw;
        if (!currentDomain && (req.body as any)?.domain) {
            currentDomain = String((req.body as any).domain || '');
        }

        if (currentDomain && !isSuperAdmin && !skipPassword) {
            const normalized = currentDomain.toUpperCase().trim();
            try {
                const domains = await storage.getUserDomainsByUserId(user.id);
                const match = Array.isArray(domains) ? domains.find((d: any) => String(d?.domain || '').toUpperCase() === normalized) : undefined;
                if (!match) {
                    return res.status(403).json({ message: `Accès refusé pour le domaine ${normalized}` });
                }
                if ((match as any).active === false) {
                    return res.status(403).json({ message: `Domaine ${normalized} inactif` });
                }

                // Si un rôle spécifique est défini pour ce domaine, on l'utilise
                if ((match as any).role) {
                    (user as any).role = (match as any).role;
                }
            } catch (e) {
                return res.status(500).json({ message: "Erreur serveur lors de la vérification du domaine" });
            }
        }

        // Mettre à jour last_login au moment de la connexion
        try {
            await storage.updateUser(user.id, { lastLogin: new Date() } as any);
            // recharger l'utilisateur pour récupérer le lastLogin mis à jour
            const refreshed = await storage.getUser(user.id);
            if (refreshed) {
                user = refreshed as any;
            }
        } catch (e) {
            console.warn('[LOGIN] Impossible de mettre à jour lastLogin pour', user.username, e);
        }

        // Normaliser le rôle (ex: "sub_agent" -> "sub-agent") pour un comportement cohérent
        const normalizedRole = String((user as any).role || '')
            .toLowerCase()
            .replace(/_/g, '-');

        // Assurer que req.session.user est typé correctement et peuplé avec les champs de SessionUser
        // Note: SessionUser est défini globalement via module augmentation dans server/index.ts
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            matricule: user.matricule,
            serviceLocation: user.serviceLocation,
            role: normalizedRole as 'admin' | 'hunter' | 'agent' | 'sub-agent' | 'hunting-guide',
            region: user.region,
            // Exposer uniquement le champ canonique de la base pour éviter toute ambiguïté côté client
            departement: (user as any).departement ?? null,
            // Inclure hunterId pour les utilisateurs avec le rôle hunter
            hunterId: (user as any).hunterId ?? null,
            isSuperAdmin,
            isDefaultRole,
            isSupervisorRole,
            createdAt: user.createdAt,
            lastLogin: (user as any).lastLogin ?? null,
            isActive: user.isActive
        } as any;
        console.log('[LOGIN] Session créée pour:', user.username, req.session.user);

        // Historique : connexion réussie
        try {
            const loginIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket?.remoteAddress || '-';
            await storage.createHistory({
                userId: user.id,
                operation: 'login',
                entityType: 'auth',
                entityId: user.id,
                details: `Connexion réussie - Utilisateur: ${user.username} - IP: ${loginIp}`,
            });
        } catch {}

        req.session.save(async (err) => {
            if (err) {
                console.error('[LOGIN] Erreur lors de la sauvegarde de la session:', err);
                return res.status(500).json({ message: "Erreur lors de la sauvegarde de la session" });
            }
            console.log('[LOGIN] Session sauvegardée avec succès pour:', user.username);
            // Générer un token JWT pour les appels API côté client
            try {
                // Inclure hunterId dans le token pour les chasseurs
                const tokenPayload: any = {
                    id: user.id,
                    role: String((user as any).role || ''),
                    region: (user as any).region,
                    isSuperAdmin,
                };

                // Ajouter hunterId si l'utilisateur est un chasseur
                if ((user as any).hunterId) {
                    tokenPayload.hunterId = (user as any).hunterId;
                    console.log('[LOGIN] Token JWT avec hunterId:', (user as any).hunterId);
                }

                const token = storage.generateAuthToken(tokenPayload);
                let grade: any = null;
                let genre: any = null;
                try {
                    const rows = await db
                        .select({
                            grade: agents.grade,
                            genre: agents.genre,
                            roleMetierCode: rolesMetier.code,
                            roleMetierLabel: rolesMetier.labelFr,
                        })
                        .from(agents)
                        .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
                        .where(eq(agents.userId as any, (user as any).id as any))
                        .limit(1);
                    grade = rows?.[0]?.grade ?? null;
                    genre = rows?.[0]?.genre ?? null;
                    const roleMetierCode = rows?.[0]?.roleMetierCode ?? null;
                    const roleMetierLabel = rows?.[0]?.roleMetierLabel ?? null;
                    const { password, ...safeUser } = user as any;
                    res.json({ 
                        message: "Connexion réussie", 
                        user: { ...safeUser, isSuperAdmin, isDefaultRole, isSupervisorRole, grade, genre, roleMetierCode, roleMetierLabel }, 
                        token 
                    });
                    return;
                } catch {}
                // Renvoyer l'objet utilisateur + flag superadmin et le token
                const { password, ...safeUser } = user as any;
                res.json({ 
                    message: "Connexion réussie", 
                    user: { ...safeUser, isSuperAdmin, isDefaultRole, isSupervisorRole, grade, genre }, 
                    token 
                });
            } catch (tokErr) {
                console.warn('[LOGIN] Impossible de générer le token JWT, on renvoie sans token:', tokErr);
                const { password, ...safeUser } = user as any;
                res.json({ 
                    message: "Connexion réussie", 
                    user: { ...safeUser, isSuperAdmin, isDefaultRole, isSupervisorRole } 
                });
            }
            console.log('[LOGIN] Réponse envoyée pour:', user.username);
        });
    } catch (error) {
        console.error("Erreur lors de la connexion:", error);
        res.status(500).end();
    }
};

export const register = async (req: Request, res: Response) => {
    try {
        console.log('[REGISTER] Tentative d\'inscription - payload brut:', req.body);

        // Valider les données d'entrée de manière sûre pour exposer les erreurs Zod clairement
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues?.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
            })) || [];
            console.warn('[REGISTER] Validation échouée:', issues);
            return res.status(400).json({ message: "Validation invalide", errors: issues });
        }

        const { username, email, password } = parsed.data;
        const firstName = parsed.data.firstName || '';
        const lastName = parsed.data.lastName || '';
        const role = parsed.data.role || 'hunter';

        // Vérifier si l'utilisateur existe déjà (username)
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser) {
            console.log('[REGISTER] Nom d\'utilisateur déjà pris:', username);
            return res.status(409).json({
                message: "Ce nom d'utilisateur est déjà utilisé.",
                field: 'username',
                code: 'USERNAME_DUPLICATE',
            });
        }

        // Vérifier si l'email existe déjà
        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) {
            console.log('[REGISTER] Email déjà utilisé:', email);
            return res.status(409).json({
                message: "Cette adresse email est déjà utilisée.",
                field: 'email',
                code: 'EMAIL_DUPLICATE',
            });
        }

        // Hachage du mot de passe avec bcrypt
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('[REGISTER] Mot de passe haché avec bcrypt');

        // Créer l'utilisateur
        const newUser = await storage.createUser({
            username,
            email,
            password: hashedPassword,
            firstName,
            lastName,
            role,
        });

        console.log('[REGISTER] Utilisateur créé avec succès:', newUser.username);
        const { password: _p, ...safeUser } = newUser as any;
        return res.status(201).json({ message: "Inscription réussie", user: safeUser });
    } catch (error: any) {
        // Distinguer les erreurs connues
        if (error?.name === 'ZodError') {
            const issues = error.issues?.map((i: any) => ({ path: i.path?.join?.('.') ?? '', message: i.message, code: i.code })) || [];
            console.warn('[REGISTER] ZodError:', issues);
            return res.status(400).json({ message: "Validation invalide", errors: issues });
        }

        // Journaliser l'erreur détaillée pour le débogage
        console.error('[REGISTER] Erreur inattendue:', error?.message || error);
        if (error?.stack) {
            console.error('[REGISTER] Stack:', error.stack);
        }

        // Utiliser 500 pour une erreur serveur et exposer le détail dans le message pour faciliter le diagnostic côté client
        const detail = String(error?.message || error);
        return res.status(500).json({ message: `Échec de l'inscription: ${detail}` });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const userId = (req.session as any)?.user?.id || null;
        const username = (req.session as any)?.user?.username || 'Inconnu';
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket?.remoteAddress || '-';
        const reason = req.body?.reason || 'manual'; // 'manual' | 'inactivity' | 'session_expired'

        // Historique : déconnexion
        try {
            await storage.createHistory({
                userId,
                operation: reason === 'inactivity' ? 'session_expired' : 'logout',
                entityType: 'auth',
                entityId: userId || 0,
                details: `Déconnexion (${reason === 'inactivity' ? 'inactivité' : reason === 'session_expired' ? 'expiration session' : 'manuelle'}) - Utilisateur: ${username} - IP: ${ip}`,
            });
        } catch {}

        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ message: "Erreur lors de la déconnexion" });
            }
            res.clearCookie('connect.sid');
            res.json({ message: "Déconnexion réussie" });
        });
    } catch (error) {
        console.error("Erreur lors de la déconnexion:", error);
        res.status(500).json({ message: "Erreur lors de la déconnexion" });
    }
};

// Heartbeat : le client envoie un ping toutes les minutes tant qu'il est actif
// Cela maintient la session vivante ; si le client arrête d'envoyer, la session expire naturellement
export const heartbeat = async (req: Request, res: Response) => {
    try {
        const sessionUser = (req.session as any)?.user || req.user;
        if (!sessionUser) {
            return res.status(401).json({ active: false, message: "Session expirée" });
        }
        // Le simple fait de toucher req.session rafraîchit la session (grâce à rolling:true)
        // On renvoie l'heure d'expiration pour que le client puisse afficher un countdown
        const maxAge = 8 * 60 * 60 * 1000; // 8h en ms
        const expiresAt = Date.now() + maxAge;
        res.json({ active: true, expiresAt, username: sessionUser.username });
    } catch (error) {
        console.error("Erreur heartbeat:", error);
        res.status(500).json({ active: false, message: "Erreur serveur" });
    }
};

export const getMe = async (req: Request, res: Response) => {
    const sessionUser = (req.session?.user || req.user) as any;
    if (!sessionUser) {
        return res.status(401).json({ message: "Non authentifié" });
    }
    try {
        const userId = Number(sessionUser?.id);
        if (!userId) {
            return res.status(401).json({ message: "Non authentifié" });
        }

        const rows = await db
            .select({
                id: users.id,
                username: users.username,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                phone: users.phone,
                matricule: users.matricule,
                serviceLocation: users.serviceLocation,
                role: users.role,
                region: users.region,
                departement: users.departement,
                hunterId: users.hunterId,
                grade: agents.grade,
                genre: agents.genre,
                roleMetierCode: rolesMetier.code,
                roleMetierLabel: rolesMetier.labelFr,
                roleMetierIsDefault: rolesMetier.isDefault,
                roleMetierIsSupervisor: rolesMetier.isSupervisor,
            })
            .from(users)
            .leftJoin(agents, eq(agents.userId as any, users.id as any))
            .leftJoin(rolesMetier, eq(agents.roleMetierId as any, rolesMetier.id as any))
            .where(eq(users.id as any, userId as any))
            .limit(1);

        const u: any = rows?.[0];
        if (!u) {
            return res.status(401).json({ message: "Non authentifié" });
        }

        // Mettre à jour la session avec les dernières valeurs de la DB
        req.session.user = {
            ...(req.session.user as any),
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            phone: u.phone,
            matricule: u.matricule,
            serviceLocation: u.serviceLocation,
            role: u.role,
            region: u.region,
            departement: u.departement,
            hunterId: u.hunterId,
        } as any;

        return res.json({
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName ?? null,
            lastName: u.lastName ?? null,
            phone: u.phone ?? null,
            matricule: u.matricule ?? null,
            serviceLocation: u.serviceLocation ?? null,
            isSuperAdmin: !!sessionUser?.isSuperAdmin,
            role: u.role,
            region: u.region ?? null,
            departement: u.departement ?? null,
            hunterId: u.hunterId ?? null,
            grade: u.grade ?? null,
            genre: u.genre ?? null,
            roleMetierCode: u.roleMetierCode ?? null,
            roleMetierLabel: u.roleMetierLabel ?? null,
            isDefaultRole: !!u.roleMetierIsDefault,
            isSupervisorRole: !!u.roleMetierIsSupervisor,
        });
    } catch (e: any) {
        return res.status(500).json({ message: e?.message || 'Erreur serveur' });
    }
};

// Vérifier la disponibilité d'un nom d'utilisateur (public)
export const checkUsername = async (req: Request, res: Response) => {
  try {
    const u = String(req.query.u || '').trim();
    if (!u) return res.status(400).json({ message: "Paramètre 'u' requis" });
    const existing = await storage.getUserByUsername(u);
    return res.json({ available: !existing });
  } catch (error) {
    console.error('[CHECK USERNAME] Erreur:', error);
    return res.status(500).json({ message: "Erreur lors de la vérification du nom d'utilisateur" });
  }
};

// Vérifier la disponibilité d'un email (public)
export const checkEmail = async (req: Request, res: Response) => {
  try {
    const e = String(req.query.e || '').trim();
    if (!e) return res.status(400).json({ message: "Paramètre 'e' requis" });
    const existing = await storage.getUserByEmail(e);
    return res.json({ available: !existing });
  } catch (error) {
    console.error('[CHECK EMAIL] Erreur:', error);
    return res.status(500).json({ message: "Erreur lors de la vérification de l'email" });
  }
};

// Vérifier le mot de passe de l'utilisateur courant (utile pour les actions critiques)
export const verifyPassword = async (req: Request, res: Response) => {
  console.log(`[AUTH] Tentative de vérification du mot de passe pour l'utilisateur: ${req.session?.user?.username || 'Inconnu'}`);
  try {
    const { password } = req.body;
    const sessionUser = req.session.user as any;

    if (!sessionUser || !sessionUser.id) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    if (!password) {
      return res.status(400).json({ message: "Mot de passe requis" });
    }

    const user = await storage.getUser(sessionUser.id);
    if (!user) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }

    const isBcryptHash = (value: string | null | undefined): boolean => {
        if (!value) return false;
        return (/^\$2[aby]\$/.test(value) && value.length >= 59 && value.length <= 64);
    };

    let passwordOk = false;
    if (isBcryptHash(user.password)) {
        passwordOk = await bcrypt.compare(password, user.password as string);
    } else {
        passwordOk = (password === user.password);
    }

    if (!passwordOk) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[VERIFY PASSWORD] Erreur:', error);
    return res.status(500).json({ message: "Erreur lors de la vérification du mot de passe" });
  }
};
