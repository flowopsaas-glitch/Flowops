import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ClaimsService } from './claims.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AddEvidenceDto,
  AddNoteDto,
  AssessClaimDto,
  ApproveClaimDto,
  CreateClaimDto,
  ListClaimsQuery,
  RejectClaimDto,
  WithdrawClaimDto,
} from './dto/claims.dto';

/**
 * Claims & liability.
 *
 * Two access tiers, enforced at the method where it matters:
 *
 *  - **Reading and reporting** a claim (including adding a note or an evidence
 *    reference) is operational: dispatch and warehouse staff are the people who
 *    see damage first. VIEWER is included because finance reviews claims.
 *  - **Deciding** a claim — assessing liability, approving, rejecting,
 *    withdrawing, settling — is confined to ADMIN, COMPANY_ADMIN and MANAGER.
 *    Once a claim is settled a credit note exists against a client's account, so
 *    the decision carries money with it.
 *
 * There is no delete anywhere: a claim is a record, and the platform does not
 * offer a way to make one disappear.
 */
@ApiTags('Claims')
@ApiBearerAuth()
@Roles(
  UserRole.ADMIN,
  UserRole.COMPANY_ADMIN,
  UserRole.MANAGER,
  UserRole.DISPATCH,
  UserRole.WAREHOUSE,
  UserRole.VIEWER,
)
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get()
  @ApiOperation({ summary: 'List claims for the tenant, newest first' })
  list(@CurrentUser() u: any, @Query() query: ListClaimsQuery) {
    return this.claims.list(u.companyId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Open claims, value at stake, approved-but-unsettled, SLA breaches' })
  summary(@CurrentUser() u: any) {
    return this.claims.summary(u.companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One claim with its append-only event history' })
  get(@CurrentUser() u: any, @Param('id') id: string) {
    return this.claims.get(u.companyId, id);
  }

  @Post()
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.WAREHOUSE,
  )
  @ApiOperation({ summary: 'Raise a claim against a waybill' })
  create(@CurrentUser() u: any, @Body() dto: CreateClaimDto) {
    return this.claims.create(u.companyId, u, dto);
  }

  @Post(':id/notes')
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.WAREHOUSE,
  )
  @ApiOperation({ summary: 'Append a note to the claim history' })
  addNote(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.claims.addNote(u.companyId, u, id, dto);
  }

  @Post(':id/evidence')
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.WAREHOUSE,
  )
  @ApiOperation({ summary: 'Attach evidence references (photos, ePOD, manifest)' })
  addEvidence(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: AddEvidenceDto) {
    return this.claims.addEvidence(u.companyId, u, id, dto);
  }

  @Post(':id/assess')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Record who carries the loss and on what basis' })
  assess(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: AssessClaimDto) {
    return this.claims.assess(u.companyId, u, id, dto);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve an amount — never above the claim or the liability cap' })
  approve(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: ApproveClaimDto) {
    return this.claims.approve(u.companyId, u, id, dto);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Reject with a reason the client can be shown' })
  reject(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: RejectClaimDto) {
    return this.claims.reject(u.companyId, u, id, dto);
  }

  @Post(':id/withdraw')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Withdraw a claim before it is settled' })
  withdraw(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: WithdrawClaimDto) {
    return this.claims.withdraw(u.companyId, u, id, dto);
  }

  @Post(':id/settle')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Settle an approved claim and raise a DRAFT credit note' })
  settle(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: WithdrawClaimDto) {
    return this.claims.settle(u.companyId, u, id, dto?.reason);
  }
}
