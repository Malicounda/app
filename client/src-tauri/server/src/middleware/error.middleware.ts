import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../exceptions/http.exception';
import { logger } from '../utils/logger';

/**
 * Middleware de gestion des erreurs global
 */
export const errorMiddleware = (
  error: HttpException,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const status: number = error.status || 500;
    const message: string = error.message || 'Une erreur est survenue';
    const errors: Record<string, any> | undefined = error.errors;
    const code: string = error.code || 'INTERNAL_SERVER_ERROR';

    // Journalisation de l'erreur
    logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);
    
    if (process.env.NODE_ENV === 'development') {
      logger.error(error.stack);
    }

    // Réponse d'erreur
    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(errors && { errors }),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Gestionnaire d'erreurs 404 (Route non trouvée)
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Route non trouvée - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Gestionnaire d'erreurs de validation
 */
export const validationErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error.name === 'ValidationError' || error.name === 'ValidatorError') {
    const errors: Record<string, string> = {};
    
    // Gestion des erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      Object.keys(error.errors).forEach((key) => {
        errors[key] = error.errors[key].message;
      });
    }
    
    // Gestion des erreurs de validation class-validator
    if (Array.isArray(error.errors) && error.errors[0]?.property) {
      error.errors.forEach((e: any) => {
        if (e.constraints) {
          errors[e.property] = Object.values(e.constraints)[0];
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Erreur de validation des données',
        errors,
      },
    });
  }
  
  next(error);
};
