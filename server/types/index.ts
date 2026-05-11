import { Session, SessionData } from 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: any;
  }
}

export type UserSession = Session & Partial<SessionData>;

export type AuthenticatedRequest = Express.Request & { session: UserSession; user?: any };

export interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  [key: string]: any;
}
