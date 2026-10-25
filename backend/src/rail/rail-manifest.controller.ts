import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailTrainManifestService } from './rail-manifest.service';
import {
  AmendTrainManifestDto, CancelTrainManifestDto, CreateTrainManifestDto, IssueTrainManifestDto,
  ManifestMoveDto, UpdateTrainManifestDto,
} from './dto/rail-manifest.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_SIGNATORY_ROLES, RAIL_WRITE_ROLES } from './rail-roles';
import { RequireFeature } from '../billing/require-feature.decorator';

/**
 * Digital Train Manifests — the departure document for a rail consignment.
 * Reads for the READ set; drafting for WRITE; issuing, amending and closing are
 * formal attestations and use the SIGNATORY set (also enforced in the service).
 */
@ApiTags('Rail / Train manifests')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@RequireFeature('rail')
@Controller('rail/manifests')
export class RailTrainManifestController {
  constructor(private readonly manifests: RailTrainManifestService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('consignmentId') consignmentId?: string,
  ) {
    return this.manifests.list(u.companyId, { status, consignmentId });
  }

  @Get(':id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.manifests.get(u.companyId, id);
  }

  @Post()
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Snapshot a consignment consist into a new DRAFT train manifest' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateTrainManifestDto) {
    return this.manifests.create(u.companyId, dto, u);
  }

  @Patch(':id')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Edit a DRAFT manifest (issued manifests are immutable — amend instead)' })
  update(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTrainManifestDto) {
    return this.manifests.update(u.companyId, id, dto, u);
  }

  @Post(':id/issue')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Issue: signatory attestation, DG-gated. Freezes the document' })
  issue(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: IssueTrainManifestDto) {
    return this.manifests.issue(u.companyId, id, dto, u);
  }

  @Post(':id/amend')
  @Roles(...RAIL_SIGNATORY_ROLES)
  @ApiOperation({ summary: 'Amend an issued manifest into a new revision (supersedes the old)' })
  amend(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: AmendTrainManifestDto) {
    return this.manifests.amend(u.companyId, id, dto, u);
  }

  @Post(':id/depart')
  @Roles(...RAIL_WRITE_ROLES)
  depart(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ManifestMoveDto) {
    return this.manifests.depart(u.companyId, id, dto, u);
  }

  @Post(':id/arrive')
  @Roles(...RAIL_WRITE_ROLES)
  arrive(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ManifestMoveDto) {
    return this.manifests.arrive(u.companyId, id, dto, u);
  }

  @Post(':id/close')
  @Roles(...RAIL_SIGNATORY_ROLES)
  close(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: ManifestMoveDto) {
    return this.manifests.close(u.companyId, id, dto, u);
  }

  @Post(':id/cancel')
  @Roles(...RAIL_WRITE_ROLES)
  cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelTrainManifestDto) {
    return this.manifests.cancel(u.companyId, id, dto, u);
  }
}
