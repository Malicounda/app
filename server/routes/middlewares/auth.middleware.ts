import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
// Evaluate secret dynamically to ensure dotenv has loaded
const getJwtSecret = () => process.env.JWT_SECRET || process.env.JWT_TOKEN || 'changeme_secret';

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  const sessionUser = (req.session as any)?.user;
  const currentUser = sessionUser || req.user;

  if (!currentUser) {
    // Fallback: accepter un JWT dans l'en-tête Authorization ou via le paramètre de requête 'token'
    const authHeader = req.headers['authorization'];
    let token = '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (token) {
      try {
        const decoded: any = jwt.verify(token, getJwtSecret());
        // decoded devrait contenir au moins id et role (selon le login controller)
        req.user = decoded as any;
        return next();
      } catch (err) {
        console.warn(`[AUTH] JWT verify failed for ${req.path}:`, err);
        return res.status(401).json({ message: "Token invalide ou expiré" });
      }
    }
    console.warn(`[AUTH] Rejet 401: Aucun utilisateur connecté pour ${req.path}. token présent: ${!!token}`);
    return res.status(401).json({ message: "Vous devez être connecté pour accéder à cette ressource" });
  }

  req.user = currentUser;
  next();
};

// Nouveau middleware pour vérifier si l'utilisateur est un administrateur
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = String((req.user as any)?.role || '').toLowerCase();
  const isSuper = !!(req.user as any)?.isSuperAdmin;
  const allowed = role === 'admin' || role === 'superadmin' || role === 'super_admin' || isSuper;
  if (!req.user || !allowed) {
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
