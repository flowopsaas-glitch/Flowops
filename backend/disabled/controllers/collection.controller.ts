import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CollectionService } from '../services/collection.service';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
  ) {}

  @Get()
  async getCollections(@Req() req: Request) {
    /**
     * req.user is already globally typed via:
     * src/types/express-request.d.ts
     *
     * {
     *   id: string
     *   role: UserRole
     *   companyId: string
     * }
     */

    const userId = Number(req.user.id);

    if (Number.isNaN(userId)) {
      throw new Error('Invalid user ID in JWT payload');
    }

    return this.collectionService.getCollectionsForUser(userId);
  }
}
