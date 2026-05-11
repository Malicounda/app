import { NextFunction, Request, Response } from 'express';

// Generic role guard
function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user: any = (req as any)?.user;
      const role: string | undefined = user?.role;
      if (!role) {
        return res.status(401).json({ message: 'Non authentifié' });
      }
      if (!roles.includes(role)) {
        return res.status(403).json({ message: 'Accès refusé' });
      }
      return next();
    } catch (e) {
      return res.status(401).json({ message: 'Non authentifié' });
    }
  };
}

export const isAdmin = requireRole(['admin']);
export const isAgent = requireRole(['agent', 'sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur', 'regional-agent', 'sector-agent']);
export const isSubAgent = requireRole(['sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur']);
export const isHuntingGuide = requireRole(['hunting-guide']);

// Combinaisons de rôles couramment utilisées
export const isAdminOrAgent = requireRole(['admin', 'agent', 'sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur', 'regional-agent', 'sector-agent']);
export const isAgentOrSubAgent = requireRole(['agent', 'sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur', 'regional-agent', 'sector-agent']);
export const isAdminAgentOrSubAgent = requireRole(['admin', 'agent', 'sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur', 'regional-agent', 'sector-agent']);
