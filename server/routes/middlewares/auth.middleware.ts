import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
// Try to get secret from env first; fallback to config if available
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_TOKEN || 'changeme_secret';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  const sessionUser = (req.session as any)?.user;
  const currentUser = sessionUser || req.user;

  if (!currentUser) {
    // Fallback: accepter un JWT dans l'en-tête Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        // decoded devrait contenir au moins id et role (selon le login controller)
        req.user = decoded as any;
        return next();
      } catch (err) {
        return res.status(401).json({ message: "Token invalide ou expiré" });
      }
    }
    console.log("Aucun utilisateur connecté dans le middleware isAuthenticated");
    return res.status(401).json({ message: "Vous devez être connecté pour accéder à cette ressource" });
  }

  req.user = currentUser;
  next();
};

// Nouveau middleware pour vérifier si l'utilisateur est un administrateur
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || (req.user.role !== 'admin' && !(req.user as any).isSuperAdmin)) {
    return res.status(403).json({ message: 'Accès refusé. Rôle administrateur requis.' });
  }
  next();
};

export const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  if (!(req.user as any).isSuperAdmin) {
    return res.status(403).json({ message: "Accès réservé au super administrateur" });
  }
  next();
};

export const isAgentOrAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'agent') {
    return res.status(403).json({ message: "Accès refusé. Droits administrateur ou agent requis." });
  }
  next();
};

// Middleware pour vérifier si l'utilisateur est un agent régional
export const isRegionalAgent = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'agent') { // 'agent' est le rôle pour les agents régionaux
    return res.status(403).json({ message: 'Accès refusé. Rôle agent régional requis.' });
  }
  next();
};

// Nouveau: autoriser admin, agent et sub-agent (agent de secteur)
export const isAdminAgentOrSubAgent = (req: Request, res: Response, next: NextFunction) => {
  const role = (req.user as any)?.role as string | undefined;
  if (!role || !['admin', 'agent', 'sub-agent'].includes(role)) {
    return res.status(403).json({ message: "Accès refusé. Rôle admin, agent ou agent de secteur requis." });
  }
  next();
};
