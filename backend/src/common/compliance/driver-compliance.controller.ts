import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import { DriverComplianceService } from './driver-compliance.service';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/user.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Compliance evidence API.
 *
 * The policy is enforced in dispatch, but the DATA it judges has to come from
 * somewhere and be fixable by the people who own it. These endpoints are that
 * surface: the fleet report tells operations exactly who is blocked and why,
 * and the evidence endpoint is the audited way to record the dates and the hold
 * — replacing "someone edits the row in the database".
 *
 * Reading the fleet is open to the roles that dispatch (they need to know who
 * they can use); changing evidence requires an operational role, and lifting a
 * compliance hold is a supervisory act.
 */

/** Fields the evidence endpoint accepts. */
export class RecordComplianceEvidenceDto {
  @IsOptional() @IsString() licenseExpiry?: string | null;
  @IsOptional() @IsString() insuranceExpiry?: string | null;
  @IsOptional() @IsString() backgroundCheckExpiry?: string | null;
  @IsOptional() @IsString() nextServiceDate?: string | null;
  @IsOptional() @IsInt() @Min(0) currentKm?: number | null;
  @IsOptional() @IsInt() @Min(0) nextServiceKm?: number | null;
  @IsOptional() @IsBoolean() complianceHold?: boolean | null;
  @IsOptional() @IsString() complianceHoldReason?: string | null;
}

/**
 * Hold payload. `hold` is REQUIRED and boolean: `PATCH /:id/hold` is a
 * supervisory act, so an empty body must be a 400 — never read as "lift the
 * hold" (the old inline type made `{}` mean exactly that).
 */
export class ComplianceHoldDto {
  @IsBoolean() hold!: boolean;
  @IsOptional() @IsString() reason?: string | null;
}

export class ComplianceQueryDto {
  @IsOptional() @IsString() status?: string;
  /** `true` returns only the drivers who are currently blocked. */
  @IsOptional() @IsString() onlyProblems?: string;
  @IsOptional() @IsString() take?: string;
}

@ApiTags('Driver Compliance')
@ApiBearerAuth()
@Controller('compliance/drivers')
export class DriverComplianceController {
  constructor(private readonly compliance: DriverComplianceService) {}

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.VIEWER,
  )
  @ApiOperation({ summary: 'Fleet compliance report: who is blocked, and why' })
  fleet(@CurrentUser() u: AuthenticatedUser, @Query() query: ComplianceQueryDto) {
    return this.compliance.fleetReport(u.companyId, {
      status: query.status,
      onlyProblems: query.onlyProblems === 'true' || query.onlyProblems === '1',
      take: query.take ? Number(query.take) : undefined,
    });
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.MANAGER,
    UserRole.DISPATCH,
    UserRole.VIEWER,
  )
  @ApiOperation({ summary: "One driver's compliance snapshot, blockers and warnings" })
  async one(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    const snapshot = await this.compliance.snapshot(id, u.companyId);
    return { snapshot, compliance: this.compliance.evaluateSnapshot(snapshot), policy: this.compliance.policy() };
  }

  /** Recording licence/insurance/service dates is operational data entry. */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @ApiOperation({ summary: 'Record compliance evidence (documents, service, hold)' })
  evidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordComplianceEvidenceDto,
  ) {
    return this.compliance.recordEvidence(id, u.companyId, dto, {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
    });
  }

  /**
   * A compliance hold stops a driver working, so putting one ON is restricted
   * to supervisors (MANAGER and above) — a dispatcher can record a licence, but
   * cannot suspend a colleague.
   */
  @Patch(':id/hold')
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Place or lift a compliance hold (supervisory)' })
  hold(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ComplianceHoldDto,
  ) {
    return this.compliance.recordEvidence(
      id,
      u.companyId,
      {
        complianceHold: dto.hold === true,
        complianceHoldReason: dto.hold === true ? (dto.reason ?? null) : null,
      },
      { id: u.id, email: u.email, name: u.name, role: u.role },
    );
  }
}
