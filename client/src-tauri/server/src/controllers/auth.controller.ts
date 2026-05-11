import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { RegisterUserDto } from '../dto/auth/register.dto.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { db } from '../../db.js';
import { users } from '../../../shared/dist/schema.js';
import { eq, or } from 'drizzle-orm';

// Utiliser class-validator pour la validation des données
async function validateRegisterDto(data: any): Promise<RegisterUserDto> {
  const registerDto = plainToInstance(RegisterUserDto, data);
  const errors = await validate(registerDto);

  if (errors.length > 0) {
    throw new Error(errors.map(e => Object.values(e.constraints || {})).join(', '));
  }

  return registerDto;
}

export const authController = {
  // Endpoint pour obtenir les informations de l'utilisateur authentifié
  getMe: async (req: Request, res: Response) => {
    try {
      const sessionUser = req.user as Express.User | undefined;
      if (!sessionUser) {
        return res.status(401).json({ message: 'Non authentifié' });
      }

      const userId = Number(sessionUser.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: 'Identifiant utilisateur invalide' });
      }

      const userResults = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        first_name: users.firstName,
        last_name: users.lastName,
        role: users.role,
        region: users.region,
        departement: users.departement,
        is_active: users.isActive,
        hunter_id: users.hunterId,
      }).from(users).where(eq(users.id, userId)).limit(1);
      
      const user = userResults[0];

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      return res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name ?? '',
        lastName: user.last_name ?? '',
        role: user.role,
        region: user.region ?? null,
        zone: user.departement ?? null,
        isActive: Boolean(user.is_active),
        hunterId: user.hunter_id ?? null,
      });
    } catch (error) {
      console.error('Erreur lors de la récupération du profil:', error);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // Endpoint pour l'inscription
  register: async (req: Request, res: Response) => {
    try {
      // Valider les données d'entrée
      const validatedData = await validateRegisterDto(req.body);

      // Vérifier si l'utilisateur existe déjà (username ou email)
      const existingResults = await db.select()
        .from(users)
        .where(
          or(
            eq(users.username, validatedData.username),
            eq(users.email, validatedData.email)
          )
        )
        .limit(1);
      
      const existing = existingResults[0];
      if (existing) {
        const field = existing.username === validatedData.username ? 'nom d\'utilisateur' : 'email';
        return res.status(400).json({ message: `Cet ${field} est déjà utilisé` });
      }

      // Hacher le mot de passe
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(validatedData.password, salt);

      // Créer l'utilisateur
      const createdResults = await db.insert(users).values({
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role || 'hunter',
        isActive: true,
      }).returning();
      
      const created = createdResults[0];

      // Créer le JWT
      const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
      const jwtSecret = (process.env.JWT_SECRET || 'dev_secret_change_me') as string;
      const token = jwt.sign({ id: created.id, role: created.role }, jwtSecret, { expiresIn: expiresIn });

      return res.status(201).json({
        token,
        user: {
          id: created.id,
          username: created.username,
          email: created.email,
          firstName: created.firstName ?? '',
          lastName: created.lastName ?? '',
          role: created.role,
        },
      });
    } catch (error) {
      console.error('Erreur lors de l\'inscription:', error);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // Endpoint pour la connexion
  login: async (req: Request, res: Response) => {
    try {
      const { identifier: idValue, password } = req.body;

      if (!idValue || !password) {
        return res.status(400).json({ message: "Identifiant et mot de passe sont requis" });
      }

      const isEmail = idValue.includes('@');
      const userResults = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        first_name: users.firstName,
        last_name: users.lastName,
        role: users.role,
        region: users.region,
        departement: users.departement,
        password: users.password,
        is_active: users.isActive,
        hunter_id: users.hunterId,
      }).from(users).where(
        isEmail ? eq(users.email, idValue) : eq(users.username, idValue)
      ).limit(1);
      
      const user = userResults[0];

      if (!user) {
        return res.status(401).json({ message: 'Identifiants invalides' });
      }

      if (!user.is_active) {
        return res.status(403).json({ message: 'Compte désactivé' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Mot de passe invalide' });
      }

      const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
      const jwtSecret = (process.env.JWT_SECRET || 'dev_secret_change_me') as string;
      
      // Inclure hunterId dans le token JWT pour les chasseurs
      const tokenPayload: any = { 
        id: user.id, 
        role: user.role 
      };
      
      // Ajouter hunterId au token si l'utilisateur est un chasseur
      if (user.hunter_id) {
        tokenPayload.hunterId = user.hunter_id;
      }
      
      const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: expiresIn });

      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name ?? '',
          lastName: user.last_name ?? '',
          role: user.role,
          // API compat: exposer "zone" mais alimenté par la colonne departement
          region: user.region ?? null,
          zone: user.departement ?? null,
          isActive: Boolean(user.is_active),
          hunterId: user.hunter_id ?? null,
        },
      });
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      return res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

export default {
  '/me': { GET: authController.getMe },
  '/login': { POST: authController.login },
  '/register': { POST: authController.register },
} as const;