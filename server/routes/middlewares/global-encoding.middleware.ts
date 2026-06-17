import { Request, Response, NextFunction } from 'express';

/**
 * Middleware global pour corriger les problèmes d'encodage (UTF-8)
 * pour les fichiers uploadés (Multer) et téléchargés (Content-Disposition).
 * 
 * Ce système garantit que n'importe quelle route actuelle ou future
 * utilisant Multer ou envoyant des fichiers aura les accents correctement gérés.
 */
export const globalEncodingFixer = (req: Request, res: Response, next: NextFunction) => {
  // 1. FIX DES UPLOADS (MULTER)
  // Multer utilise Busboy qui décode les noms de fichiers en Latin-1 par défaut.
  // On intercepte l'assignation de req.file et req.files par Multer pour les forcer en UTF-8.
  let _file: any = undefined;
  let _files: any = undefined;

  Object.defineProperty(req, 'file', {
    get() { return _file; },
    set(value) {
      if (value && value.originalname) {
        try {
          value.originalname = Buffer.from(value.originalname, 'latin1').toString('utf8');
        } catch (e) { /* ignore */ }
      }
      _file = value;
    },
    enumerable: true,
    configurable: true
  });

  Object.defineProperty(req, 'files', {
    get() { return _files; },
    set(value) {
      if (Array.isArray(value)) {
        value.forEach(f => {
          if (f && f.originalname) {
            try {
              f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
            } catch (e) { /* ignore */ }
          }
        });
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            arr.forEach(f => {
              if (f && f.originalname) {
                try {
                  f.originalname = Buffer.from(f.originalname, 'latin1').toString('utf8');
                } catch (e) { /* ignore */ }
              }
            });
          }
        });
      }
      _files = value;
    },
    enumerable: true,
    configurable: true
  });

  // 2. FIX DES TÉLÉCHARGEMENTS (CONTENT-DISPOSITION)
  // On intercepte les headers sortants pour s'assurer que les noms de fichiers
  // dans "Content-Disposition" utilisent le format standard filename*=UTF-8''
  const originalSetHeader = res.setHeader;
  res.setHeader = function(name: string, value: string | number | readonly string[]) {
    if (name.toLowerCase() === 'content-disposition' && typeof value === 'string') {
      // Si on détecte un filename="..." classique mais pas de format UTF-8 explicite
      if (value.includes('filename="') && !value.includes('filename*=UTF-8')) {
        const match = value.match(/filename="([^"]+)"/);
        if (match && match[1]) {
          const filename = match[1];
          const encoded = encodeURIComponent(filename);
          // On remplace le vieux format par le format robuste UTF-8
          const newValue = value.replace(/filename="[^"]+"/, `filename*=UTF-8''${encoded}`);
          return originalSetHeader.call(this, name, newValue);
        }
      }
    }
    return originalSetHeader.call(this, name, value);
  };

  next();
};
