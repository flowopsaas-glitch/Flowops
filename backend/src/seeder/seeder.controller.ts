import { Controller, Post, Req, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { SeederService } from './seeder.service';

@Controller('seeder')
@UseGuards(JwtAuthGuard)
export class SeederController {
  private readonly logger = new Logger('SeederController');
  constructor(private readonly seeder: SeederService) {}

  @Post('demo')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async seedDemo(@Req() req: any) {
    const companyId = Number(req.user?.companyId || 1);
    return this.seeder.seedDemoData(companyId);
  }
}
