import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MaintenanceService } from './maintenance.service';
import {
  AddJobCostDto,
  AddJobNoteDto,
  AssetHistoryQuery,
  CancelJobDto,
  CompleteJobDto,
  CreateAssetDto,
  CreateFaultCodeDto,
  CreateJobDto,
  ListAssetsQuery,
  ListJobsQuery,
  MaintenanceSummaryQuery,
  RecordMeterDto,
  SignOffJobDto,
  StartJobDto,
  UpdateAssetDto,
} from './dto/maintenance.dto';

/**
 * Asset maintenance & warranty.
 *
 * Two access tiers, split where the consequence is:
 *
 *  - **Recording** — raising a card, starting it, adding parts and labour,
 *    reading a meter — is operational. The people who see a breakdown are the
 *    driver, the yard supervisor and the workshop clerk, and a card that cannot
 *    be raised at the machine is a card that gets raised next week or not at
 *    all. VIEWER is included because finance and the contract holder read this.
 *  - **Concluding** — completing a job, signing it off, cancelling it, and
 *    deciding what warranty it carries — is confined to ADMIN, COMPANY_ADMIN
 *    and MANAGER. Completion sets the warranty clock, and sign-off is the
 *    custodian accepting the work: both carry a liability, not a shift.
 *
 * There is no delete route. A job card is evidence; the correction path is
 * cancellation with a reason, which leaves the card and its history in place.
 */
@ApiTags('Maintenance')
@ApiBearerAuth()
@Roles(
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.WAREHOUSE,
  UserRole.VIEWER,
)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  // ── Fleet ────────────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Availability, comebacks, stalled cards and warranty exposure — with reasons' })
  summary(@CurrentUser() u: any, @Query() query: MaintenanceSummaryQuery) {
    return this.maintenance.summary(u.companyId, query);
  }

  // ── Assets ───────────────────────────────────────────────────────────────

  @Get('assets')
  @ApiOperation({ summary: 'The asset register, newest unit number first' })
  listAssets(@CurrentUser() u: any, @Query() query: ListAssetsQuery) {
    return this.maintenance.listAssets(u.companyId, query);
  }

  @Post('assets')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @ApiOperation({ summary: 'Register a unit' })
  createAsset(@CurrentUser() u: any, @Body() dto: CreateAssetDto) {
    return this.maintenance.createAsset(u.companyId, u, dto);
  }

  @Get('assets/:id')
  @ApiOperation({ summary: 'One unit, its open job, recent cards and warranty position' })
  getAsset(@CurrentUser() u: any, @Param('id') id: string) {
    return this.maintenance.getAsset(u.companyId, id);
  }

  @Patch('assets/:id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Edit a unit — status, custodian, site. Unit number is locked once it has history' })
  updateAsset(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.maintenance.updateAsset(u.companyId, u, id, dto);
  }

  @Post('assets/:id/meter')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.WAREHOUSE)
  @ApiOperation({ summary: 'Record a meter reading — refused if the meter would run backwards' })
  recordMeter(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: RecordMeterDto) {
    return this.maintenance.recordMeter(u.companyId, u, id, dto);
  }

  @Get('assets/:id/history')
  @ApiOperation({ summary: 'The unit page: availability, cost per hour, fault pattern and comebacks' })
  assetHistory(@CurrentUser() u: any, @Param('id') id: string, @Query() query: AssetHistoryQuery) {
    return this.maintenance.assetHistory(u.companyId, id, query);
  }

  // ── Fault codes ──────────────────────────────────────────────────────────

  @Get('fault-codes')
  @ApiOperation({ summary: 'The tenant’s controlled fault vocabulary' })
  listFaultCodes(@CurrentUser() u: any, @Query('includeInactive') includeInactive?: string) {
    return this.maintenance.listFaultCodes(u.companyId, includeInactive === 'true');
  }

  @Post('fault-codes')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Add a fault code — without codes, repeat failures cannot be grouped' })
  createFaultCode(@CurrentUser() u: any, @Body() dto: CreateFaultCodeDto) {
    return this.maintenance.createFaultCode(u.companyId, dto);
  }

  // ── Job cards ────────────────────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({ summary: 'Job cards, newest first' })
  listJobs(@CurrentUser() u: any, @Query() query: ListJobsQuery) {
    return this.maintenance.listJobs(u.companyId, query);
  }

  @Post('jobs')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.WAREHOUSE)
  @ApiOperation({ summary: 'Raise a job card — repeats of an earlier fault are linked automatically' })
  createJob(@CurrentUser() u: any, @Body() dto: CreateJobDto) {
    return this.maintenance.createJob(u.companyId, u, dto);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'One card with its costs, warranty position and append-only history' })
  getJob(@CurrentUser() u: any, @Param('id') id: string) {
    return this.maintenance.getJob(u.companyId, id);
  }

  @Post('jobs/:id/start')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.WAREHOUSE)
  @ApiOperation({ summary: 'Mark the work as started' })
  startJob(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: StartJobDto) {
    return this.maintenance.startJob(u.companyId, u, id, dto);
  }

  @Post('jobs/:id/complete')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Record what was done and what warranty it carries — starts the warranty clock' })
  completeJob(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: CompleteJobDto) {
    return this.maintenance.completeJob(u.companyId, u, id, dto);
  }

  @Post('jobs/:id/sign-off')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'The custodian accepts the work — terminal, and not an edit' })
  signOff(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: SignOffJobDto) {
    return this.maintenance.signOffJob(u.companyId, u, id, dto);
  }

  @Post('jobs/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Withdraw a card with a reason — the correction path, since there is no delete' })
  cancelJob(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: CancelJobDto) {
    return this.maintenance.cancelJob(u.companyId, u, id, dto);
  }

  @Post('jobs/:id/costs')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH, UserRole.WAREHOUSE)
  @ApiOperation({ summary: 'Add a parts, labour or outside-service line' })
  addCost(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: AddJobCostDto) {
    return this.maintenance.addCost(u.companyId, u, id, dto);
  }

  @Post('jobs/:id/notes')
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.WAREHOUSE,
  )
  @ApiOperation({ summary: 'Append a note to the card history' })
  addNote(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: AddJobNoteDto) {
    return this.maintenance.addNote(u.companyId, u, id, dto);
  }
}
