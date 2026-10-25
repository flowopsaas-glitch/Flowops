import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailOptimizerService } from './rail-optimizer.service';
import { ApplyOptimizerDto, RunOptimizerDto } from './dto/rail-optimizer.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Schedule Optimizer — decision support for slot allocation (Phase 2 of the
 * event-driven rail architecture). `run` is read-only analysis; `apply` executes
 * human decisions through the normal allocate/reject workflow.
 */
@ApiTags('Rail / Schedule optimizer')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/optimizer')
export class RailOptimizerController {
  constructor(private readonly optimizer: RailOptimizerService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run the slot optimizer over pending applications (proposes; never mutates)' })
  run(@CurrentUser() u: AuthenticatedUser, @Body() dto: RunOptimizerDto) {
    return this.optimizer.run(u.companyId, dto);
  }

  @Post('apply')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Apply human-approved optimizer decisions via the normal allocate/reject workflow' })
  apply(@CurrentUser() u: AuthenticatedUser, @Body() dto: ApplyOptimizerDto) {
    return this.optimizer.apply(u.companyId, dto, u);
  }
}
