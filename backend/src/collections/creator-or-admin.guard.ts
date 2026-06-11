// src/collections/creator-or-admin.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CollectionsService } from './collections.service';

@Injectable()
export class CreatorOrAdminGuard implements CanActivate {
  constructor(private readonly collectionsService: CollectionsService) {}

  canActivate(context: ExecutionContext): boolean {
    // Implement your guard logic here
    return true;
  }
}