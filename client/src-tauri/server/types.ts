import { Request, Response, NextFunction } from 'express';
import { Session, SessionData } from 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

export type UserSession = Session & Partial<SessionData>;

export interface AuthenticatedRequest extends Request {
  user?: any;
  session: UserSession;
}

export interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  [key: string]: any;
}

export const log = (message: string, source: string = 'app') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${source}] ${message}`);
};

export const isAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Non authentifié' });
  }
  req.user = req.session.user;
  next();
};

export const hasRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    next();
  };
};
