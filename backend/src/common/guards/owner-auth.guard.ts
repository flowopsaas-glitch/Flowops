import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects owner-only routes using the 'jwt-owner' Passport strategy. */
@Injectable()
export class OwnerAuthGuard extends AuthGuard('jwt-owner') {
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Owner authentication required');
    }
    return user;
  }

  getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }
}
