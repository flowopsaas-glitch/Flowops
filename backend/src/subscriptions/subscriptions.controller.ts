import {
  Controller,
  Post,
  Delete,
  Get,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import { Role } from '../auth/roles.enum'

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SubscriptionsController {
  @Post()
  create() {
    return { message: 'Admin-only: subscription created' }
  }

  @Get()
  list() {
    return { message: 'Admin-only: subscriptions list' }
  }

  @Delete(':id')
  cancel() {
    return { message: 'Admin-only: subscription cancelled' }
  }
}
