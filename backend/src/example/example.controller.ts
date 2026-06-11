import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/user-role.enum';

@Controller('example')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExampleController {
  @Get('admin-only')
  @Roles(Role.ADMIN)
  adminOnly() {
    return 'ADMIN OK';
  }

  @Get('company')
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  companyAdmins() {
    return 'COMPANY OK';
  }
}
