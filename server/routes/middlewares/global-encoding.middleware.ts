import { Request, Response, NextFunction } from 'express';
import { normalizeOriginalFilename } from '../../lib/filenameEncoding.js';

/**
 * Middleware global pour corriger les problèmes d'encodage (UTF-8)
 * pour les fichiers uploadés (Multer) et téléchargés (Content-Disposition).
 *
 * Utilise normalizeOriginalFilename afin de ne JAMAIS corrompre un nom déjà en UTF-8 valide
 * (un décodage latin1->utf8 aveugle transformait les accents valides en caractère ).
 */
export const globalEncodingFixer = (req: Request, res: Response, next: NextFunction) => {
  // 1. FIX DES UPLOADS (MULTER)
  let _file: any = undefined;
  let _files: any = undefined;

  Object.defineProperty(req, 'file', {
    get() { return _file; },
    set(value) {
      if (value && value.originalname) {
        try {
          value.originalname = normalizeOriginalFilename(value.originalname);
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
              f.originalname = normalizeOriginalFilename(f.originalname);
            } catch (e) { /* ignore */ }
          }
        });
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            arr.forEach(f => {
              if (f && f.originalname) {
                try {
                  f.originalname = normalizeOriginalFilename(f.originalname);
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
