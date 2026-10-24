import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailWeighbridgeService } from './rail-weighbridge.service';
import { RecordWeighbridgeReadingDto } from './dto/rail-weighbridge.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/** Weighbridge readings. An overloaded wagon puts its consignment on HOLD_FOR_LOAD_ADJUSTMENT until it is re-weighed within its limit. */
@ApiTags('Rail / Weighbridge')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/weighbridge')
export class RailWeighbridgeController {
  constructor(private readonly weighbridge: RailWeighbridgeService) {}

  @Get('readings')
  list(@CurrentUser() u: AuthenticatedUser, @Query('consignmentId') consignmentId?: string) { return this.weighbridge.list(u.companyId, { consignmentId }); }

  @Post('readings')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Record a reading; the response says whether the wagon is overloaded and whether the consignment is now on hold' })
  record(@CurrentUser() u: AuthenticatedUser, @Body() dto: RecordWeighbridgeReadingDto) { return this.weighbridge.recordReading(u.companyId, dto, u); }
}
