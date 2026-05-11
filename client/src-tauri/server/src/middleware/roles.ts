import { Request, Response, NextFunction } from 'express';
import { ROLES } from '../config/roles.js';
import { SessionUser } from './auth.js';

export const checkRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const role = (req.user as any)?.role as string | undefined;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ 
        message: `Accès refusé. Rôle requis: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
};

export const isAdmin = checkRole([ROLES.ADMIN]);
export const isAgent = checkRole([ROLES.AGENT]);
export const isHunter = checkRole([ROLES.HUNTER]);
export const isAdminOrAgent = checkRole([ROLES.ADMIN, ROLES.AGENT]);
// Inclure les agents de secteur dans les vérifications combinées
export const isAdminAgentOrSubAgent = checkRole([ROLES.ADMIN, ROLES.AGENT, ROLES.SUB_AGENT]);
export const isAgentOrSubAgent = checkRole([ROLES.AGENT, ROLES.SUB_AGENT]);
