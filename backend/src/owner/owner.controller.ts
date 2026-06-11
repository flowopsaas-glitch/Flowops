import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { OwnerService } from "./owner.service";

@Controller("owner")
@Public()
export class OwnerController {
  constructor(private readonly ownerService: OwnerService) {}

  @Get("access/companies")
  getCompanies() {
    return this.ownerService.getCompanies();
  }

  @Get("access/company/:companyId/users")
  getUsersByCompany(@Param("companyId") companyId: string) {
    return this.ownerService.getUsersByCompany(Number(companyId));
  }

  @Patch("access/users/:id/password")
  resetTenantUserPassword(
    @Param("id") id: string,
    @Body() body: { password?: string }
  ) {
    return this.ownerService.resetTenantUserPassword(
      Number(id),
      String(body?.password || "")
    );
  }

  @Post("access/company/:companyId/admins")
  createTenantAdmin(
    @Param("companyId") companyId: string,
    @Body() body: { email?: string; password?: string; role?: string }
  ) {
    return this.ownerService.createTenantAdmin(Number(companyId), {
      email: String(body?.email || ""),
      password: String(body?.password || ""),
      role: String(body?.role || "COMPANY_ADMIN"),
    });
  }

  @Patch("access/company/:companyId/subscription")
  updateCompanySubscription(
    @Param("companyId") companyId: string,
    @Body()
    body: {
      subscriptionPlan?: string;
      isActive?: boolean;
      monthlyPrice?: number | null;
      setupFee?: number | null;
      priceNotes?: string | null;
      enabledFeatures?: string[];
    }
  ) {
    return this.ownerService.updateCompanySubscription(Number(companyId), body);
  }

  @Get("access/company/:companyId/ai-summary")
  getCompanyAiSummary(@Param("companyId") companyId: string) {
    return this.ownerService.getCompanyAiSummary(Number(companyId));
  }

  @Patch("access/users/:id/toggle")
  toggleUser(
    @Param("id") id: string,
    @Body() body: { isActive?: boolean }
  ) {
    return this.ownerService.toggleUserActive(Number(id), !!body?.isActive);
  }

  @Post("access/users/:id/delete")
  deleteUser(@Param("id") id: string) {
    return this.ownerService.deleteUser(Number(id));
  }

  @Patch("access/company/:companyId/demo")
  toggleDemo(
    @Param("companyId") companyId: string,
    @Body() body: { enabled?: boolean }
  ) {
    return this.ownerService.toggleDemoMode(Number(companyId), !!body?.enabled);
  }

  @Post("access/company/:companyId/apply-plan-preset")
  applyPlanPreset(
    @Param("companyId") companyId: string,
    @Body() body: { plan?: string }
  ) {
    return this.ownerService.applyPlanPreset(
      Number(companyId),
      String(body?.plan || "STARTER")
    );
  }

  @Get("access/company/:companyId/auto-fill")
  getAutoFillSuggestion(@Param("companyId") companyId: string) {
    return this.ownerService.getAutoFillSuggestion(Number(companyId));
  }

  @Get("access/tenant-health")
  getTenantHealthOverview() {
    return this.ownerService.getTenantHealthOverview();
  }

  @Get("access/audit-timeline")
  getAuditTimeline() {
    return this.ownerService.getAuditTimeline();
  }

  @Get("access/company/:companyId/recommend-plan")
  recommendPlan(@Param("companyId") companyId: string) {
    return this.ownerService.getPlanRecommendation(Number(companyId));
  }

  @Post("access/change-owner-password")
  changeOwnerPassword(@Body() body: { password?: string }) {
    return this.ownerService.changeOwnerPassword(String(body?.password || ""));
  }
}
