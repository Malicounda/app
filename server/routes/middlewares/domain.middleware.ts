import { NextFunction, Request, Response } from 'express';
import { storage } from '../../storage.js';

interface CheckDomainOptions {
  domain?: string;
  roles?: string[];
  headerName?: string; // default 'x-domain'
}

export function checkDomain(arg?: string | CheckDomainOptions) {
  const opts: CheckDomainOptions = typeof arg === 'string' ? { domain: arg } : (arg || {});
  const headerName = (opts.headerName || 'x-domain').toLowerCase();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser: any = (req as any).user || (req.session as any)?.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: 'Authentification requise' });
      }

      if (currentUser?.isSuperAdmin) {
        return next();
      }

      // Determine domain to enforce
      let domain = (opts.domain || '').trim();
      if (!domain) {
        const headers = req.headers || {};
        const fromHeader = (headers[headerName] || headers[headerName.toUpperCase()]) as string | string[] | undefined;
        domain = Array.isArray(fromHeader) ? fromHeader[0] : (fromHeader || '');
      }

      if (!domain) {
        return res.status(400).json({ message: 'En-tête X-Domain requis' });
      }

      const normalized = String(domain).trim().toUpperCase();
      const domains = await storage.getUserDomainsByUserId(Number(currentUser.id));
      const match = Array.isArray(domains) ? domains.find(d => String((d as any).domain || '').toUpperCase() === normalized) : undefined;

      if (!match) {
        return res.status(403).json({ message: `Accès refusé. Domaine ${normalized} non attribué à l'utilisateur.` });
      }
      if ((match as any).active === false) {
        return res.status(403).json({ message: `Accès refusé. Domaine ${normalized} inactif pour l'utilisateur.` });
      }

      if (opts.roles && opts.roles.length > 0) {
        const role = String((match as any).role || '').toLowerCase();
        const allowed = opts.roles.map(r => r.toLowerCase());
        if (!allowed.includes(role)) {
          return res.status(403).json({ message: `Accès refusé. Rôle de domaine requis: ${opts.roles.join(', ')}` });
        }
      }

      (req as any).domain = normalized;
      (req as any).userDomain = match;
      return next();
    } catch (err) {
      console.error('[checkDomain] erreur middleware:', err);
      return res.status(500).json({ message: 'Erreur serveur lors de la validation du domaine' });
    }
  };
}
