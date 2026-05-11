import { Session, SessionData } from 'express-session';
import { ParamsDictionary, Query } from 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    session: Session & Partial<SessionData> & {
      user?: any;
    };
    // Add user on Request so middlewares and routes can safely read/write req.user
    user?: any;
  }
}

export interface RequestWithUser<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = Query> 
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: any;
  params: P;
}
