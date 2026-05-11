import { SessionUser } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
