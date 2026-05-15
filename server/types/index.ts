import { Session, SessionData } from 'express-session';

// Augmenter le type SessionData pour ajouter notre champ 'user'
declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

// Augmenter Express.Request pour garantir la présence de sessionID et user
declare module 'express-serve-static-core' {
  interface Request {
    user?: any;
  }
}

export interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  [key: string]: any;
}
