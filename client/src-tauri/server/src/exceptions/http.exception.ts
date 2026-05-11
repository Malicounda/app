/**
 * Exception HTTP personnalisée
 */
export class HttpException extends Error {
  public status: number;
  public message: string;
  public errors?: Record<string, any>;
  public code?: string;

  constructor(
    status: number,
    message: string,
    errors?: Record<string, any>,
    code?: string
  ) {
    super(message);
    this.status = status;
    this.message = message;
    this.errors = errors;
    this.code = code;
    
    // Assurez-vous que le nom de la classe est correctement défini
    Object.setPrototypeOf(this, HttpException.prototype);
  }
}

/**
 * Exception 400 - Mauvaise requête
 */
export class BadRequestException extends HttpException {
  constructor(message = 'Requête incorrecte', errors?: Record<string, any>) {
    super(400, message, errors, 'BAD_REQUEST');
  }
}

/**
 * Exception 401 - Non autorisé
 */
export class UnauthorizedException extends HttpException {
  constructor(message = 'Non autorisé') {
    super(401, message, undefined, 'UNAUTHORIZED');
  }
}

/**
 * Exception 403 - Accès refusé
 */
export class ForbiddenException extends HttpException {
  constructor(message = 'Accès refusé') {
    super(403, message, undefined, 'FORBIDDEN');
  }
}

/**
 * Exception 404 - Non trouvé
 */
export class NotFoundException extends HttpException {
  constructor(message = 'Ressource non trouvée') {
    super(404, message, undefined, 'NOT_FOUND');
  }
}

/**
 * Exception 409 - Conflit
 */
export class ConflictException extends HttpException {
  constructor(message = 'Conflit détecté') {
    super(409, message, undefined, 'CONFLICT');
  }
}

/**
 * Exception 422 - Entité non traitable
 */
export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Entité non traitable', errors?: Record<string, any>) {
    super(422, message, errors, 'UNPROCESSABLE_ENTITY');
  }
}

/**
 * Exception 429 - Trop de requêtes
 */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Trop de requêtes') {
    super(429, message, undefined, 'TOO_MANY_REQUESTS');
  }
}

/**
 * Exception 500 - Erreur serveur interne
 */
export class InternalServerErrorException extends HttpException {
  constructor(message = 'Erreur interne du serveur') {
    super(500, message, undefined, 'INTERNAL_SERVER_ERROR');
  }
}

/**
 * Exception 503 - Service indisponible
 */
export class ServiceUnavailableException extends HttpException {
  constructor(message = 'Service temporairement indisponible') {
    super(503, message, undefined, 'SERVICE_UNAVAILABLE');
  }
}
