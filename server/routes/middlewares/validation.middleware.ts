import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodSchema } from 'zod';
import { fromZodError } from 'zod-validation-error';
// Note: Avoid augmenting Express.Request.files here to prevent conflicts with @types/multer

/**
 * Middleware pour valider les données de la requête par rapport à un schéma Zod
 * @param schema Schéma Zod pour la validation
 * @param property Partie de la requête à valider ('body', 'query' ou 'params')
 */
export const validateRequest = (schema: ZodSchema, property: 'body' | 'query' | 'params' = 'body'): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req[property]);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: validationError.details,
        });
      }
      
      // Remplacer les données de la requête par les données validées
      req[property] = result.data;
      next();
    } catch (error) {
      console.error('Erreur de validation:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la validation des données',
      });
    }
  };
};

/**
 * Middleware pour valider les fichiers téléchargés
 * @param fieldName Nom du champ de fichier
 * @param maxSize Taille maximale en octets (par défaut 5 Mo)
 * @param allowedMimeTypes Types MIME autorisés (par défaut images et PDF)
 */
export const validateFileUpload = (
  fieldName: string,
  maxSize: number = 5 * 1024 * 1024, // 5 Mo par défaut
  allowedMimeTypes: string[] = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.files) {
        return next(); // Aucun fichier à valider
      }

      const anyFiles = req.files as any;
      const files = Array.isArray(anyFiles) ? anyFiles : anyFiles[fieldName];
      if (!files) {
        return next(); // Aucun fichier pour ce champ
      }
      const file = Array.isArray(files) ? files[0] : files;

      // Vérifier la taille du fichier
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: `Le fichier est trop volumineux. Taille maximale autorisée: ${maxSize / (1024 * 1024)} Mo`,
        });
      }

      // Vérifier le type MIME
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Type de fichier non autorisé. Types autorisés: ${allowedMimeTypes.join(', ')}`,
        });
      }

      next();
    } catch (error) {
      console.error('Erreur lors de la validation du fichier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la validation du fichier',
      });
    }
  };
};

/**
 * Middleware pour valider les paramètres d'URL
 * @param schema Schéma Zod pour la validation des paramètres
 */
export const validateParams = (schema: ZodSchema) => {
  return validateRequest(schema, 'params');
};

/**
 * Middleware pour valider les paramètres de requête
 * @param schema Schéma Zod pour la validation des paramètres de requête
 */
export const validateQuery = (schema: ZodSchema) => {
  return validateRequest(schema, 'query');
};

/**
 * Middleware pour valider le corps de la requête
 * @param schema Schéma Zod pour la validation du corps de la requête
 */
export const validateBody = (schema: ZodSchema) => {
  return validateRequest(schema, 'body');
};

export default {
  validateRequest,
  validateFileUpload,
  validateParams,
  validateQuery,
  validateBody,
};
