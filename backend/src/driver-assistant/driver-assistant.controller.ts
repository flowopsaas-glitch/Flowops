import { Controller, Get, Req } from '@nestjs/common';
import { DriverAssistantService } from './driver-assistant.service';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';

@Controller('driver-assistant')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.COMPANY_ADMIN, Role.DISPATCH, Role.OPERATOR, Role.DRIVER)
export class DriverAssistantController {
  constructor(private readonly svc: DriverAssistantService) {}

  // GET /api/driver-assistant/dashboard
  @Get('dashboard')
  async dashboard(@Req() req: any) {
    return this.svc.dashboard(req?.user || null);
  }
}