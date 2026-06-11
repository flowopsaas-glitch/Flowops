import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const tenant = this.apiKeyService.findByApiKey(apiKey);

    if (!tenant) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach tenant to request (VERY important)
    request.tenant = tenant;

    return true;
  }
}
