import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { LegalService } from './legal.service';

@Public()
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('terms-meta')
  termsMeta() {
    return this.legal.getTermsMeta();
  }

  @Public()
  @Get('tenant-limits')
  tenantLimits() {
    return { limitsByPlan: this.legal.getConfiguredTenantLimits() };
  }
}
