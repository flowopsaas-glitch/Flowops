import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('subscriptions')
@Roles(UserRole.ADMIN)
export class SubscriptionsController {
  constructor() {}

  @Get()
  findAll() {
    return { message: 'This route is restricted to ADMIN users' };
  }
}
