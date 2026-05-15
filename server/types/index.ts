// Augmenter Express.Request pour ajouter le champ user (session et sessionID sont déjà fournis par @types/express-session)
declare module 'express-serve-static-core' {
  interface Request {
    user?: any;
  }
}

// Augmenter SessionData pour ajouter notre champ 'user' dans la session
declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

export interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  [key: string]: any;
}
