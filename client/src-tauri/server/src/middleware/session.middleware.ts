import { Request, Response, NextFunction } from 'express';
import { getRepository } from 'typeorm';
import { User as UserEntity, UserRole } from '../entities/user.entity'; // Renommer pour éviter conflit et importer UserRole
import jwt from 'jsonwebtoken';

// Augmentation du type Express.User pour inclure les champs personnalisés
declare global {
  namespace Express {
    interface User {
      id: string; // Ou number, selon votre entité User. jwt.verify retourne string pour id par défaut.
      username?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      role?: UserRole; // Utiliser l'enum UserRole importé
      hunter_id?: number; // Rendre optionnel car pas tous les users sont des chasseurs
    }
  }
}

// Middleware pour vérifier le JWT
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Récupérer le token du header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token non fourni' });
    }

    // Extraire le token
    const token = authHeader.split(' ')[1];

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    // Vérifier si l'utilisateur existe toujours dans la base de données
    const userRepository = getRepository(UserEntity);
    const user = await userRepository.findOne({
      where: { id: decoded.id },
      select: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'hunter_id'] // Ajout de hunter_id
    });
    
    if (user) {
      req.user = user; // Assignation de l'objet utilisateur à req.user
      // Log détaillé pour vérifier le contenu brut de user, y compris hunter_id
      console.log('##### [session.middleware.ts] req.user BRUT après DB:', JSON.stringify(req.user, null, 2));
      next();
    } else {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }
  } catch (error) {
    console.error('Erreur dans le middleware d\'authentification:', error);
    return res.status(401).json({ message: 'Token invalide' });
  }
};

// Middleware pour vérifier si l'utilisateur est admin
export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authMiddleware(req, res, next);
    
    if (req.user && req.user.role !== 'admin') { // Ajout d'une vérification pour req.user
      return res.status(403).json({ message: 'Accès refusé' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Non authentifié' });
  }
};
