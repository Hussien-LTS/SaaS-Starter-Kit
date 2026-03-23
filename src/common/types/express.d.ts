import { JwtPayload } from '../../auth/strategies/jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
