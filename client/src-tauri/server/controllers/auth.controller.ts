import bcrypt from 'bcryptjs';
import { sql as sqlRaw } from 'drizzle-orm/sql';
import { z } from 'zod';
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
            return res.status(401).json({ message: "Identifiants invalides" });
        } else {
            console.log('[LOGIN] Utilisateur trouvé:', user.username);
        }

        // Détection si le mot de passe stocké est un hash bcrypt
        const isBcryptHash = (value: string | null | undefined): boolean => {
            if (!value) return false;
            return (/^\$2[aby]\$/.test(value) && value.length >= 59 && value.length <= 64);
        };

        let passwordOk = false;
        if (isBcryptHash(user.password)) {
            // Comparaison sécurisée via bcrypt
            passwordOk = await bcrypt.compare(password, user.password as string);
            if (!passwordOk) {
                console.log('[LOGIN] Mot de passe (bcrypt) incorrect pour:', user.username);
                return res.status(401).json({ message: "Identifiants invalides" });
            }
        } else {
            // Ancien mot de passe en clair: comparer en clair puis migrer vers hash si OK
            if (password !== user.password) {
                console.log('[LOGIN] Mot de passe (plain) incorrect pour:', user.username);
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
            createdAt: user.createdAt,
            lastLogin: (user as any).lastLogin ?? null,
            isActive: user.isActive
        } as any;
        console.log('[LOGIN] Session créée pour:', user.username, req.session.user);

        req.session.save((err) => {
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
                    region: (user as any).region
                };

                // Ajouter hunterId si l'utilisateur est un chasseur
                if ((user as any).hunterId) {
                    tokenPayload.hunterId = (user as any).hunterId;
                    console.log('[LOGIN] Token JWT avec hunterId:', (user as any).hunterId);
                }

                const token = storage.generateAuthToken(tokenPayload);
                // Renvoyer l'objet utilisateur actualisé et le token
                res.json({ message: "Connexion réussie", user, token });
            } catch (tokErr) {
                console.warn('[LOGIN] Impossible de générer le token JWT, on renvoie sans token:', tokErr);
                res.json({ message: "Connexion réussie", user });
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
        return res.status(201).json({ message: "Inscription réussie", user: newUser });
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

export const logout = (req: Request, res: Response) => {
    try {
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

export const getMe = async (req: Request, res: Response) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Non authentifié" });
    }
    // Renvoyer les informations de l'utilisateur stockées dans la session
    const { id, username, email, firstName, lastName, role, region, departement, hunterId } = req.session.user as any;
    try {
        const agentRows = await db.execute(sqlRaw`
          SELECT id_agent AS "idAgent",
                 user_id AS "userId",
                 matricule_sol AS "matriculeSol",
                 nom,
                 prenom,
                 grade,
                 contact,
                 created_at AS "createdAt"
          FROM agents
          WHERE user_id = ${id}
          LIMIT 1;
        `);
        const agent = Array.isArray(agentRows) ? (agentRows as any[])[0] ?? null : null;

        const domainRows = await db.execute(sqlRaw`
          SELECT
            ud.id,
            ud.user_id AS "userId",
            ud.domain,
            ud.domaine_id AS "domaineId",
            d.nom_domaine AS "nomDomaine",
            d.code_slug AS "codeSlug",
            ud.niveau_acces AS "niveauAcces",
            ud.zone_geographique AS "zoneGeographique",
            ud.role,
            ud.active,
            ud.created_at AS "createdAt"
          FROM user_domains ud
          LEFT JOIN domaines d ON d.id = ud.domaine_id
          WHERE ud.user_id = ${id}
          ORDER BY ud.domain;
        `);

        return res.json({
            id,
            username,
            email,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            role,
            region: region ?? null,
            departement: departement ?? null,
            hunterId: hunterId ?? null,
            agent,
            domains: Array.isArray(domainRows) ? domainRows : [],
        });
    } catch (e) {
        return res.json({
            id,
            username,
            email,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            role,
            region: region ?? null,
            departement: departement ?? null,
            hunterId: hunterId ?? null,
            agent: null,
            domains: [],
        });
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
